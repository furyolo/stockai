import os
import sys
import json
import logging
import warnings
from dotenv import load_dotenv
import finnhub

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
    """获取股票符号数据"""
    try:
        logging.info("开始获取股票符号数据...")
        
        # 加载环境变量
        load_dotenv()
        
        # 初始化 Finnhub client
        finnhub_client = finnhub.Client(api_key=os.getenv("FINNHUB_API_KEY"))
        
        # 获取股票符号数据
        symbols = finnhub_client.stock_symbols('US')
        logging.info(f"成功获取 {len(symbols)} 条股票符号数据。")
        
        return symbols

    except Exception as e:
        logging.error(f"获取股票符号数据失败: {str(e)}")
        raise

if __name__ == "__main__":
    try:
        stock_symbols = fetch_stock_symbols()
        # 将结果以JSON格式打印到标准输出
        json.dump(stock_symbols, sys.stdout, ensure_ascii=False, default=str)
        logging.info("数据已成功输出到 stdout。")
    except Exception as e:
        sys.exit(1) # 以非零状态码退出表示错误 