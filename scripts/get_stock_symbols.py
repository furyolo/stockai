import sys
import json
import logging
import akshare as ak
import pandas as pd
import math

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

def fetch_stock_symbols():
    """获取股票代码数据"""
    try:
        logging.info("开始获取股票代码数据...")
        # 获取股票代码数据
        df = ak.stock_us_spot_em()
        logging.info(f"成功获取 {len(df)} 条股票代码数据。")

        # 转换列名
        df = df.rename(columns={
            "序号": "index",
            "名称": "name",
            "最新价": "price",
            "涨跌额": "price_change",
            "涨跌幅": "price_change_percent",
            "开盘价": "open",
            "最高价": "high",
            "最低价": "low",
            "昨收价": "pre_close",
            "总市值": "market_value",
            "市盈率": "pe_ratio",
            "成交量": "volume",
            "成交额": "turnover",
            "振幅": "amplitude",
            "换手率": "turnover_rate",
            "代码": "fullsymbol"
        })

        # 选择需要的列（与 Prisma 模型对应）
        columns_to_keep = [
            "index", "name", "price", "price_change", "price_change_percent", 
            "open", "high", "low", "pre_close", "market_value", 
            "pe_ratio", "volume", "turnover", "amplitude",
            "turnover_rate", "fullsymbol"
        ]
        df = df[columns_to_keep]

        # 数据清洗和类型转换
        # 将 pandas 的 <NA> 或 NaN 替换为 None (JSON null)
        df = df.replace({pd.NA: None, float('nan'): None})

        # 确保数值类型可以被JSON序列化，并处理潜在的 Infinity
        numeric_cols = ["price", "price_change", "price_change_percent", "open", "high", "low", "pre_close", "pe_ratio", "amplitude", "turnover_rate"]
        int_cols = ["index"] # "volume", "turnover", "market_value" 本身可能是大数，直接转dict即可

        for col in numeric_cols:
            # 尝试转换为 float，失败则设为 None
            df[col] = pd.to_numeric(df[col], errors='coerce')
            # 替换无穷大值为 None
            df[col] = df[col].replace([float('inf'), float('-inf')], None)

        for col in int_cols:
            # 尝试转换为 Int64 (pandas nullable integer), 失败则设为 None
            df[col] = pd.to_numeric(df[col], errors='coerce').astype('Int64')


        # 转换为字典列表
        data = df.to_dict('records')

        # 进一步处理 BigInt 字段，确保它们是数字或null
        bigint_cols = ["market_value", "volume", "turnover"]
        for record in data:
            for col in bigint_cols:
                if record[col] is not None:
                    try:
                        # 尝试直接转换为int，如果太大或非数字会失败
                        record[col] = int(record[col])
                    except (ValueError, TypeError):
                        # 如果转换失败，设为 None
                        record[col] = None
                # 如果已经是 None，则保持 None
            # 彻底清洗所有字段中的NaN/Infinity
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        # 过滤掉 fullsymbol 为空的记录
        data = [record for record in data if record.get("fullsymbol")]

        # 基于fullsymbol提取symbol字段，并赋值到每条记录
        for record in data:
            fullsymbol = record.get("fullsymbol")
            if fullsymbol and "." in fullsymbol:
                record["symbol"] = fullsymbol.split(".", 1)[1]
            else:
                record["symbol"] = None
        logging.info("已为所有记录提取并赋值symbol字段。")

        logging.info(f"数据处理完成，准备输出 {len(data)} 条有效记录。")
        return data

    except Exception as e:
        logging.error(f"获取或处理美股数据失败: {str(e)}")
        # logging.exception(e) # 可以取消注释以获取详细堆栈跟踪
        raise # 重新抛出异常，以便 Node.js 可以捕获错误

if __name__ == "__main__":
    try:
        stock_symbols = fetch_stock_symbols()
        # 将结果以JSON格式打印到标准输出
        json.dump(stock_symbols, sys.stdout, ensure_ascii=False, default=str, allow_nan=False)
        logging.info("数据已成功输出到 stdout。")
    except Exception as e:
        sys.exit(1) # 以非零状态码退出表示错误 