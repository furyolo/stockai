import { PrismaClient, Prisma } from '@prisma/client';
import { execSync, spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

// 定义从 Python 脚本接收的数据结构类型
interface StockSymbolFromPython {
    index: number | null;
    name: string;
    price: number | null;
    price_change: number | null;
    price_change_percent: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    pre_close: number | null;
    market_value: number | string | null; // Python可能输出为数字或大数科学计数法字符串
    pe_ratio: number | null;
    volume: number | string | null;
    turnover: number | string | null;
    amplitude: number | null;
    turnover_rate: number | null;
    fullsymbol: string;
    symbol: string;
}

async function getStockSymbolsFromPython(): Promise<StockSymbolFromPython[]> {
    const pythonScriptPath = path.join(__dirname, '..', 'scripts', 'get_stock_symbols.py');
    const command = 'uv';
    const args = ['run', 'python', pythonScriptPath];
    console.log(`[Node.js] Executing command: ${command} ${args.map(a => `"${a}"`).join(' ')}`);

    return await new Promise<StockSymbolFromPython[]>((resolve, reject) => {
        const child = spawn(command, args, {
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString('utf-8');
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString('utf-8');
            // 实时输出 Python 脚本日志
            process.stderr.write(data);
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
                const data = JSON.parse(stdout) as StockSymbolFromPython[];
                console.log(`[Node.js] Parsed ${data.length} records from Python script.`);
                resolve(data);
            } catch (error: any) {
                console.error(`[Node.js] Error parsing Python script output: ${error.message}`);
                if (stderr) console.error(`[Node.js] Python stderr: ${stderr}`);
                reject(new Error('Failed to parse data from Python script.'));
            }
        });
    });
}

// 将接收到的数据转换为 Prisma StockSymbolUpdateInput 类型
function transformSymbolForUpdate(data: StockSymbolFromPython): Omit<Prisma.StockSymbolUpdateInput, 'fullsymbol'> {
    // Helper to convert number/string to BigInt or null
    const toBigIntOrNull = (value: number | string | null): bigint | null => {
        if (value === null || value === undefined) return null;
        try {
            // 尝试直接转换，处理数字和看起来像数字的字符串
            return BigInt(value);
        } catch (e) {
            console.warn(`[Node.js] Could not convert value "${value}" to BigInt for symbol ${data.fullsymbol}. Setting to null.`);
            return null; // 如果转换失败，返回 null
        }
    };

        // Helper to convert number/string to Decimal or null
        const toDecimalOrNull = (value: number | null): Prisma.Decimal | null => {
        if (value === null || value === undefined || !isFinite(value)) return null; // 检查 null, undefined, NaN, Infinity
        try {
            return new Prisma.Decimal(value.toFixed(4)); // 保留4位小数创建Decimal
        } catch (e) {
            console.warn(`[Node.js] Could not convert value "${value}" to Decimal for symbol ${data.fullsymbol}. Setting to null.`);
            return null;
        }
    };


    return {
        index: data.index,
        name: data.name,
        price: toDecimalOrNull(data.price),
        price_change: toDecimalOrNull(data.price_change),
        price_change_percent: toDecimalOrNull(data.price_change_percent),
        open: toDecimalOrNull(data.open),
        high: toDecimalOrNull(data.high),
        low: toDecimalOrNull(data.low),
        pre_close: toDecimalOrNull(data.pre_close),
        market_value: toBigIntOrNull(data.market_value),
        pe_ratio: toDecimalOrNull(data.pe_ratio),
        volume: toBigIntOrNull(data.volume),
        turnover: toBigIntOrNull(data.turnover),
        amplitude: toDecimalOrNull(data.amplitude),
        turnover_rate: toDecimalOrNull(data.turnover_rate),
        symbol: data.symbol,
    };
}

async function updateStockSymbols() {
    console.log("[Node.js] Starting stock symbols update process...");
    try {
        const stocks = await getStockSymbolsFromPython();

        if (!stocks || stocks.length === 0) {
            console.log("[Node.js] No stock symbols received from Python script. Exiting.");
            return;
        }

        console.log(`[Node.js] Preparing to upsert ${stocks.length} stock symbol records...`);
        let successCount = 0;
        let errorCount = 0;
        const batchSize = 500; // 批量处理大小
        let promises: Promise<any>[] = [];

        for (let i = 0; i < stocks.length; i++) {
            const stock = stocks[i];
            if (!stock.fullsymbol) {
                console.warn("[Node.js] Skipping record due to missing symbol (primary key):", stock);
                errorCount++;
                continue;
            }

            try {
                const updateData = transformSymbolForUpdate(stock);
                // BigInt字段转换函数，复用transformSymbolForUpdate中的实现
                const toBigIntOrNull = (value: number | string | null): bigint | null => {
                    if (value === null || value === undefined) return null;
                    try {
                        return BigInt(value);
                    } catch (e) {
                        console.warn(`[Node.js] Could not convert value "${value}" to BigInt for symbol ${stock.fullsymbol}. Setting to null.`);
                        return null;
                    }
                };
                const createData = {
                    index: stock.index,
                    name: stock.name,
                    price: stock.price,
                    price_change: stock.price_change,
                    price_change_percent: stock.price_change_percent,
                    open: stock.open,
                    high: stock.high,
                    low: stock.low,
                    pre_close: stock.pre_close,
                    market_value: toBigIntOrNull(stock.market_value),
                    pe_ratio: stock.pe_ratio,
                    volume: toBigIntOrNull(stock.volume),
                    turnover: toBigIntOrNull(stock.turnover),
                    amplitude: stock.amplitude,
                    turnover_rate: stock.turnover_rate,
                    fullsymbol: stock.fullsymbol,
                    symbol: stock.symbol,
                };

                promises.push(
                    prisma.stockSymbol.upsert({
                        where: { fullsymbol: stock.fullsymbol },
                        update: updateData,
                        create: createData,
                    })
                );

                if (promises.length === batchSize || i === stocks.length - 1) {
                    const results = await Promise.allSettled(promises);
                    results.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            successCount++;
                        } else {
                            const errorIndex = i - (promises.length - 1) + index;
                            const failedSymbol = stocks[errorIndex]?.fullsymbol || 'unknown';
                            console.error(`[Node.js] Error upserting stock symbol ${failedSymbol}: ${result.reason?.message || result.reason}`);
                            errorCount++;
                        }
                    });
                    console.log(`[Node.js] Processed batch up to record ${i + 1}. Current success: ${successCount}, errors: ${errorCount}`);
                    promises = [];
                }
            } catch (transformError: any) {
                console.error(`[Node.js] Error transforming data for stock symbol ${stock.fullsymbol}: ${transformError.message}`);
                errorCount++;
                if (promises.length === batchSize || i === stocks.length - 1) {
                    promises = [];
                }
            }
        }

        console.log(`[Node.js] Stock symbols update finished. Total records processed: ${stocks.length}. Success: ${successCount}, Errors: ${errorCount}`);

    } catch (error) {
        console.error("[Node.js] An error occurred during the update process:", error);
    } finally {
        await prisma.$disconnect();
        console.log("[Node.js] Prisma client disconnected.");
    }
}

updateStockSymbols(); 