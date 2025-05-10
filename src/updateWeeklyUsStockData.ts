import { PrismaClient, Prisma } from '@prisma/client';
import { spawn } from 'child_process';
import path from 'path';

interface SymbolItem {
  fullsymbol: string;
  symbol: string;
}

interface WeeklyKline {
  symbol: string;
  dates: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  turnover: number | null;
  amplitude: number | null;
  price_change_percent: number | null;
  price_change: number | null;
  turnover_rate: number | null;
}

function transformKlineForUpsert(data: WeeklyKline): any {
  return {
    symbol: data.symbol,
    dates: data.dates,
    open: data.open,
    close: data.close,
    high: data.high,
    low: data.low,
    volume: data.volume ? BigInt(data.volume) : null,
    turnover: data.turnover ? BigInt(data.turnover) : null,
    amplitude: data.amplitude,
    price_change_percent: data.price_change_percent,
    price_change: data.price_change,
    turnover_rate: data.turnover_rate,
  };
}

async function getAllSymbols(prisma: PrismaClient): Promise<SymbolItem[]> {
  const symbols = await prisma.stockSymbol.findMany({
    select: { fullsymbol: true, symbol: true },
    where: {
      AND: [
        { fullsymbol: { not: '' } },
        { symbol: { not: '' } }
      ]
    }
  });
  return symbols;
}

async function fetchWeeklyKlinesFromPython(symbols: SymbolItem[], start_date: string, end_date: string, progressCallback?: (symbol: string, status: string) => void): Promise<WeeklyKline[]> {
  const pythonScriptPath = path.join(__dirname, '..', 'scripts', 'get_weekly_us_stock_data.py');
  const command = 'uv';
  const args = ['run', 'python', pythonScriptPath];
  const input = JSON.stringify({ symbols, start_date, end_date });

  return await new Promise<WeeklyKline[]>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdin.write(input);
    child.stdin.end();

    child.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });
    const readline = require('readline');
    const rl = readline.createInterface({ input: child.stderr });
    rl.on('line', (line: string) => {
      if (line.includes('done,')) {
        // 先输出symbol进度
        console.log(`[进度] ${line}`);
        // 解析symbol和状态
        const match = line.match(/^(\S+) done, (.+)$/);
        if (match && progressCallback) {
          const symbol = match[1];
          const status = match[2];
          progressCallback(symbol, status);
        }
      } else {
        process.stderr.write(line + '\n');
      }
      stderr += line + '\n';
    });
    child.on('error', (err) => {
      reject(new Error(`[Node.js] Failed to start Python process: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`[Node.js] Python process exited with code ${code}`);
        if (stderr) console.error(`[Node.js] Python stderr: ${stderr}`);
        reject(new Error('Failed to get data from Python script.'));
        return;
      }
      try {
        const data = JSON.parse(stdout) as WeeklyKline[];
        console.log(`[Node.js] Parsed ${data.length} weekly kline records from Python script.`);
        resolve(data);
      } catch (error: any) {
        console.error(`[Node.js] Error parsing Python script output: ${error.message}`);
        if (stderr) console.error(`[Node.js] Python stderr: ${stderr}`);
        reject(new Error('Failed to parse data from Python script.'));
      }
    });
  });
}

async function updateWeeklyUsStockData(start_date: string, end_date: string) {
  const prisma = new PrismaClient();
  await prisma.$connect();
  console.log("[Node.js] Starting weekly US stock data update process...");
  try {
    // 查询所有symbol
    const allSymbols = await getAllSymbols(prisma);
    if (!allSymbols || allSymbols.length === 0) {
      console.log("[Node.js] No symbols found in database. Exiting.");
      return;
    }
    // 查询已抓取过的symbol
    const grabbedSymbolsRaw = await prisma.stockWeeklyData.findMany({
      select: { symbol: true },
      distinct: ['symbol']
    });
    const grabbedSymbolsSet = new Set(grabbedSymbolsRaw.map(item => item.symbol));
    // 取差集，得到未抓取symbol
    const ungrabbedSymbols = allSymbols.filter(item => !grabbedSymbolsSet.has(item.symbol));
    if (ungrabbedSymbols.length === 0) {
      console.log("[Node.js] All symbols already grabbed. Nothing to do.");
      return;
    }
    // 进度统计
    const total = ungrabbedSymbols.length;
    let finished = 0;
    function printProgress() {
      const percent = ((finished) / total * 100).toFixed(2);
      console.log(`[进度] 已完成: ${finished}, 剩余: ${total - finished}, 进度: ${percent}%`);
    }
    // 传入进度回调
    const klines = await fetchWeeklyKlinesFromPython(ungrabbedSymbols, start_date, end_date, (symbol: string, status: string) => {
      // 无论data还是NoneType object都计为完成
      finished++;
      printProgress();
    });
    if (!klines || klines.length === 0) {
      console.log("[Node.js] No weekly kline data received from Python script. Exiting.");
      return;
    }
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 500;
    let promises: Promise<any>[] = [];
    for (let i = 0; i < klines.length; i++) {
      const kline = klines[i];
      if (!kline.symbol || !kline.dates) {
        errorCount++;
        continue;
      }
      const upsertData = transformKlineForUpsert(kline);
      promises.push(
        prisma.stockWeeklyData.upsert({
          where: { symbol_dates: { symbol: kline.symbol, dates: kline.dates } },
          update: upsertData,
          create: upsertData,
        })
      );
      if (promises.length === batchSize || i === klines.length - 1) {
        const results = await Promise.allSettled(promises);
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successCount++;
          } else {
            errorCount++;
          }
        });
        promises = [];
      }
    }
    console.log(`[Node.js] Weekly US stock data update finished. Total: ${klines.length}, Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    console.error("[Node.js] An error occurred during the update process:", error);
  } finally {
    await prisma.$disconnect();
    console.log("[Node.js] Prisma client disconnected.");
  }
}

// 默认全量模式，后续可通过命令行参数支持增量
const START_DATE = "20240102";
const END_DATE = new Date().toISOString().slice(0, 10).replace(/-/g, "");

(async () => {
  await updateWeeklyUsStockData(START_DATE, END_DATE);
})(); 