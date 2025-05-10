import sys
import json
import logging
import akshare as ak
import pandas as pd
import math
import asyncio

# 强制标准输出为 UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# 配置日志记录
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(levelname)s - %(message)s', 
    datefmt = "%H:%M:%S",
    stream=sys.stderr, 
    encoding='utf-8'
)

MAX_CONCURRENT = 10  # 最大并发数
RETRY = 2            # 失败重试次数
semaphore = asyncio.Semaphore(MAX_CONCURRENT)

def fetch_weekly_data_for_symbol(fullsymbol, symbol, start_date, end_date):
    """抓取单个symbol的分周K线数据（同步函数）"""
    try:
        df = ak.stock_us_hist(symbol=fullsymbol, period="weekly", start_date=start_date, end_date=end_date, adjust="qfq")
        if df is None or df.empty:
            return []
        df = df.rename(columns={
            "日期": "dates",
            "开盘": "open",
            "收盘": "close",
            "最高": "high",
            "最低": "low",
            "成交量": "volume",
            "成交额": "turnover",
            "振幅": "amplitude",
            "涨跌幅": "price_change_percent",
            "涨跌额": "price_change",
            "换手率": "turnover_rate"
        })
        df["symbol"] = symbol
        keep_cols = ["dates", "open", "close", "high", "low", "volume", "turnover", "amplitude", "price_change_percent", "price_change", "turnover_rate", "symbol"]
        df = df[keep_cols]
        df = df.replace({pd.NA: None, float('nan'): None})
        for col in ["open", "close", "high", "low", "amplitude", "price_change_percent", "price_change", "turnover_rate"]:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            df[col] = df[col].replace([float('inf'), float('-inf')], None)
        for col in ["volume", "turnover"]:
            try:
                df[col] = df[col].apply(lambda x: int(x) if pd.notnull(x) else None)
            except Exception:
                df[col] = None
        for record in df.to_dict("records"):
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None
        return df.to_dict("records")
    except Exception as e:
        logging.error(f"抓取{fullsymbol}失败: {e}")
        return []

async def fetch_with_retry(fullsymbol, symbol, start_date, end_date):
    for attempt in range(RETRY + 1):
        try:
            async with semaphore:
                result = await asyncio.to_thread(fetch_weekly_data_for_symbol, fullsymbol, symbol, start_date, end_date)
                if result and isinstance(result, list) and len(result) > 0:
                    print(f"{symbol} done successfully", file=sys.stderr, flush=True)
                else:
                    print(f"{symbol} failed, got NoneType object", file=sys.stderr, flush=True)
                return result
        except Exception as e:
            if attempt < RETRY:
                await asyncio.sleep(1)
            else:
                logging.error(f"抓取{fullsymbol}多次失败: {e}")
                print(f"{symbol} failed, got NoneType object", file=sys.stderr, flush=True)
                return []

async def main():
    try:
        input_data = await asyncio.to_thread(sys.stdin.read)
        params = json.loads(input_data)
        symbol_list = params.get("symbols", [])
        start_date = params.get("start_date", "20240102")
        end_date = params.get("end_date")
        if not end_date:
            from datetime import datetime
            end_date = datetime.now().strftime("%Y%m%d")
        all_data = []
        # 并发抓取每个symbol的数据（带重试和限流）
        tasks = [
            fetch_with_retry(item.get("fullsymbol"), item.get("symbol"), start_date, end_date)
            for item in symbol_list if item.get("fullsymbol") and item.get("symbol")
        ]
        results = await asyncio.gather(*tasks)
        for data in results:
            all_data.extend(data)
        logging.info(f"数据处理完成，准备输出 {len(all_data)} 条分周K线记录。")
        await asyncio.to_thread(json.dump, all_data, sys.stdout, ensure_ascii=False, default=str, allow_nan=False)
        logging.info("数据已成功输出到 stdout。")
    except Exception as e:
        logging.error(f"脚本执行失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())