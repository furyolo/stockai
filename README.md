# StockAI

基于 Python 和 TypeScript 的股票数据分析和 AI 应用平台。

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

## 使用说明

1. 启动 Python 服务：
   ```bash
   python main.py
   ```

2. 更新股票数据：
   ```bash
   # 更新美股股票名称列表
   pnpm run update:us-stock-names

   # 更新股票代码信息
   pnpm run update:stock-symbols
   ```

## 开发指南

### Python 开发

- 使用 Python 3.12+ 的新特性
- 遵循 PEP 8 编码规范
- 使用 uv 管理依赖
- 推荐使用 PyPI 镜像源加速依赖安装

### TypeScript 开发

- 使用 TypeScript 5.8.3+ 严格模式
- 遵循项目的 ESLint 规则
- 使用 Prisma 6.7.0+ 进行数据库操作
- 所有类型定义放在 types/ 目录下

## 数据源

- 股票基础数据：通过 akshare 1.16.83+ 获取
- 金融市场数据：通过 finnhub-python 2.4.23+ API 获取
- 数据存储：使用 Prisma 6.7.0+ 管理的数据库
- 支持的数据类型：
  - 股票基本信息
  - 实时行情数据
  - 历史交易数据
  - 公司财务数据

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

本项目采用 ISC 许可证 - 详见 [LICENSE](LICENSE) 文件

## 作者

- Andy
