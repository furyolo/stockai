# StockAI

基于 Python 和 TypeScript 的股票数据分析和 AI 应用平台。

## 近期更新 / 新特性

- 支持批量 upsert 美股名称与股票代码信息，数据同步更高效
- 数据库结构升级，字段更丰富，主键更合理，兼容大数据量
- 自动化数据库迁移流程，安全幂等，推荐开发/生产环境统一采用
- TypeScript/Python 脚本联动，支持一键同步与批量处理
- 新增美股每周K线数据批量抓取与入库，支持进度实时反馈，自动跳过已抓取symbol

## 项目概述

StockAI 是一个结合了 Python 数据分析能力和 TypeScript 全栈开发的现代化股票分析平台。项目利用 akshare 获取股票数据，通过 pandas 进行数据处理，并使用 Prisma 进行数据持久化。

## 技术栈

### Python 部分
- Python 3.12+
- akshare 1.16.83+: 股票数据获取
- pandas 2.2.3+: 数据分析和处理
- finnhub-python 2.4.23+: 金融数据 API
- python-dotenv 1.1.0+: 环境变量管理
- uv: 包管理器

### TypeScript/Node.js 部分
- TypeScript 5.8.3+
- Prisma ORM 6.7.0+
- pnpm 10.8.1+: 包管理器
- Node.js 18+

### TypeScript 开发

- 使用 TypeScript 5.8.3+ 严格模式
- 遵循项目的 ESLint 规则
- 使用 Prisma 6.7.0+ 进行数据库操作
- 所有类型定义放在 types/ 目录下
- 推荐扩展 types/ 目录，统一管理自定义类型，提升类型安全与可维护性
- 建议结合最新 TypeScript 特性与严格模式，提升代码健壮性

## 项目结构

```
stockai/
├── src/               # TypeScript 源代码
├── prisma/            # Prisma 数据库配置
├── scripts/           # 工具脚本
├── types/            # TypeScript 类型定义
├── main.py           # Python 主程序入口
├── pyproject.toml    # Python 项目配置
├── package.json      # Node.js 项目配置
├── tsconfig.json     # TypeScript 配置
└── .env             # 环境变量配置
```

## 环境要求

- Python 3.12 或更高版本
- Node.js 18 或更高版本
- pnpm 10.8.1 或更高版本
- 数据库（由 Prisma 支持）

## 安装说明

1. 克隆仓库：
   ```bash
   git clone <repository-url>
   cd stockai
   ```

2. 安装 Python 依赖：
   ```bash
   # 配置 PyPI 镜像源（可选，推荐国内用户配置）
   uv pip config set global.index-url https://mirrors.tuna.tsinghua.edu.cn/pypi/web/simple

   # 创建并激活虚拟环境
   uv venv
   source .venv/bin/activate  # 在 Windows 上使用 .venv\Scripts\activate

   # 安装依赖
   uv pip install -r requirements.txt
   ```

3. 安装 Node.js 依赖：
   ```bash
   # 安装 pnpm（如果未安装）
   npm install -g pnpm@10.8.1

   # 安装项目依赖
   pnpm install
   ```

4. 环境配置：
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，填入必要的配置信息：
   # - 数据库连接信息
   # - API 密钥
   # - 其他环境特定配置
   ```

5. 数据库设置：
   ```bash
   pnpm prisma generate
   pnpm prisma migrate dev
   ```

### 数据库结构升级与自动化迁移

本次升级对数据库 schema 进行了优化：
- `UsStocksName` 表支持中英文名称、主键为 symbol，自动记录更新时间
- `StockSymbol` 表字段更丰富，主键为 fullsymbol，支持高精度行情与大市值数据
- 所有表均支持批量 upsert，便于大规模数据同步
- 新增 `StockWeeklyData` 表，支持美股每周K线数据批量入库，主键为 (symbol, dates)，自动记录抓取与更新时间

推荐使用自动化迁移命令，确保数据库结构与 schema 保持一致：

```bash
pnpm prisma migrate dev      # 开发环境自动迁移
pnpm prisma migrate deploy   # 生产环境自动迁移
```

详细自动化迁移方案见 prisma/Task-DB-Init.md

## 使用说明

1. 启动 Python 服务：
   ```bash
   python main.py
   ```

2. 批量抓取并入库美股每周K线数据：
   ```bash
   pnpm update:weekly-us-stock-data
   ```
   > 默认抓取所有未入库symbol的历史周K线数据，自动跳过已抓取symbol，支持进度实时反馈。
   > 可根据需要修改 src/updateWeeklyUsStockData.ts 以支持自定义日期范围或增量抓取。