import { PrismaClient, Prisma } from '@prisma/client';
import { execSync, spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

// 定义从 Python 脚本接收的数据结构类型
interface StockSymbolFromPython {
    currency: string | null;
    description: string | null;
    displaySymbol: string;
    figi: string | null;
    mic: string | null;
    shareClassFIGI: string | null;
    symbol: string;
    type: string | null;
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
function transformSymbolForUpdate(data: StockSymbolFromPython): Omit<Prisma.StockSymbolUpdateInput, 'symbol'> {
    return {
        currency: data.currency,
        description: data.description,
        displaySymbol: data.displaySymbol,
        figi: data.figi,
        mic: data.mic,
        shareClassFIGI: data.shareClassFIGI,
        type: data.type,
    };
}

async function updateStockSymbols() {
    console.log("[Node.js] Starting stock symbols update process...");
    try {
        const symbols = await getStockSymbolsFromPython();

        if (!symbols || symbols.length === 0) {
            console.log("[Node.js] No stock symbols received from Python script. Exiting.");
            return;
        }

        console.log(`[Node.js] Preparing to upsert ${symbols.length} stock symbol records...`);
        let successCount = 0;
        let errorCount = 0;
        const batchSize = 500; // 批量处理大小
        let promises: Promise<any>[] = [];

        for (let i = 0; i < symbols.length; i++) {
            const symbol = symbols[i];
            if (!symbol.symbol) {
                console.warn("[Node.js] Skipping record due to missing symbol (primary key):", symbol);
                errorCount++;
                continue;
            }

            try {
                const updateData = transformSymbolForUpdate(symbol);
                const createData = {
                    symbol: symbol.symbol,
                    currency: symbol.currency,
                    description: symbol.description,
                    displaySymbol: symbol.displaySymbol,
                    figi: symbol.figi,
                    mic: symbol.mic,
                    shareClassFIGI: symbol.shareClassFIGI,
                    type: symbol.type,
                };

                promises.push(
                    prisma.stockSymbol.upsert({
                        where: { symbol: symbol.symbol },
                        update: updateData,
                        create: createData,
                    })
                );

                if (promises.length === batchSize || i === symbols.length - 1) {
                    const results = await Promise.allSettled(promises);
                    results.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            successCount++;
                        } else {
                            const errorIndex = i - (promises.length - 1) + index;
                            const failedSymbol = symbols[errorIndex]?.symbol || 'unknown';
                            console.error(`[Node.js] Error upserting stock symbol ${failedSymbol}: ${result.reason?.message || result.reason}`);
                            errorCount++;
                        }
                    });
                    console.log(`[Node.js] Processed batch up to record ${i + 1}. Current success: ${successCount}, errors: ${errorCount}`);
                    promises = [];
                }
            } catch (transformError: any) {
                console.error(`[Node.js] Error transforming data for stock symbol ${symbol.symbol}: ${transformError.message}`);
                errorCount++;
                if (promises.length === batchSize || i === symbols.length - 1) {
                    promises = [];
                }
            }
        }

        console.log(`[Node.js] Stock symbols update finished. Total records processed: ${symbols.length}. Success: ${successCount}, Errors: ${errorCount}`);

    } catch (error) {
        console.error("[Node.js] An error occurred during the update process:", error);
    } finally {
        await prisma.$disconnect();
        console.log("[Node.js] Prisma client disconnected.");
    }
}

updateStockSymbols(); 