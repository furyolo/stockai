# scripts/get_us_stocks.py
import akshare as ak
import pandas as pd
import json
import sys
import logging
import warnings

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
# 忽略 pandas 可能产生的特定警告
warnings.simplefilter(action='ignore', category=FutureWarning)

def fetch_us_stock_name():
    """获取美股名称并处理"""
    try:
        logging.info("开始获取美股名称...")
        # 获取美股股票列表 (name, cname, symbol)
        df = ak.get_us_stock_name()
        logging.info(f"成功获取 {len(df)} 条美股名称。")

        # 数据清洗和类型转换
        # 将 pandas 的 <NA> 或 NaN 替换为 None (JSON null)
        df = df.replace({pd.NA: None, float('nan'): None})

        # 转换为字典列表
        data = df.to_dict('records')

        # Final pass to ensure no NaNs slip through to JSON
        for record in data:
            for key, value in record.items():
                if isinstance(value, (float, int)) and pd.isna(value):
                    record[key] = None

        return data

    except Exception as e:
        logging.error(f"获取或处理美股数据失败: {str(e)}")
        # logging.exception(e) # 可以取消注释以获取详细堆栈跟踪
        raise # 重新抛出异常，以便 Node.js 可以捕获错误

if __name__ == "__main__":
    try:
        us_stock_name = fetch_us_stock_name()
        # 将结果以JSON格式打印到标准输出
        # Make sure allow_nan=False (default) to catch issues if any NaNs remain
        json.dump(us_stock_name, sys.stdout, ensure_ascii=False, default=str, allow_nan=False)
        logging.info("数据已成功输出到 stdout。")
    except Exception as e:
        # 如果 fetch_us_stock_data 内部出错，错误日志已记录
        # 这里只需确保 Node.js 知道出错了
        sys.exit(1) # 以非零状态码退出表示错误 