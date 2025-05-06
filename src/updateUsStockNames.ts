import { PrismaClient, Prisma } from '@prisma/client';
import { execSync, spawn } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

// 定义从 Python 脚本接收的数据结构类型 (已更新)
interface StockNameFromPython {
    name: string;       // 英文名称
    cname: string | null; // 中文名称
    symbol: string; // 股票代码(主键)
}

async function getStockNameFromPython(): Promise<StockNameFromPython[]> {
    const pythonScriptPath = path.join(__dirname, '..', 'scripts', 'get_us_stock_name.py');
    // 确保使用正确的 Python 解释器路径，或者假设 'python' 在 PATH 中
    // 激活 uv 虚拟环境并运行 Python
    const command = 'uv';
    const args = ['run', 'python', pythonScriptPath];
    console.log(`[Node.js] Executing command: ${command} ${args.map(a => `"${a}"`).join(' ')}`);

    return await new Promise<StockNameFromPython[]>((resolve, reject) => {
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
                const data = JSON.parse(stdout) as StockNameFromPython[];
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

// 将接收到的数据转换为 Prisma UsStocksNameUpdateInput 类型 (用于 upsert 的 update 部分)
function transformNameForUpdate(data: StockNameFromPython): Omit<Prisma.UsStocksNameUpdateInput, 'symbol'> {
    // 返回需要更新的字段 (除了主键 symbol)
    return {
        name: data.name,
        cname: data.cname,
        // fetchedAt 和 updatedAt 由 Prisma 处理
    };
}


async function updateStockName() {
    console.log("[Node.js] Starting stock name update process...");
    try {
        
        const stocks = await getStockNameFromPython();

        if (!stocks || stocks.length === 0) {
            console.log("[Node.js] No stock name received from Python script. Exiting.");
            return;
        }

        console.log(`[Node.js] Preparing to upsert ${stocks.length} stock name records using 'symbol' as key...`); // Log updated
        let successCount = 0;
        let errorCount = 0;
        const batchSize = 500; // 批量处理大小
        let promises: Promise<any>[] = [];

        for (let i = 0; i < stocks.length; i++) {
            const stock = stocks[i];
            // 主要检查条件改为 symbol
            if (!stock.symbol) {
                console.warn("[Node.js] Skipping record due to missing symbol (primary key):", stock);
                errorCount++;
                continue;
            }

            try {
                const updateData = transformNameForUpdate(stock);
                promises.push(
                    prisma.usStocksName.upsert({
                        where: { symbol: stock.symbol }, // 使用 symbol 作为 where 条件
                        update: updateData, // 更新 name 和 cname
                        create: { // 创建时需要提供所有字段
                            name: stock.name,
                            cname: stock.cname,
                            symbol: stock.symbol,
                        },
                    })
                );

                if (promises.length === batchSize || i === stocks.length - 1) {
                    const results = await Promise.allSettled(promises);
                    results.forEach((result, index) => {
                        if (result.status === 'fulfilled') {
                            successCount++;
                        } else {
                            const errorIndex = i - (promises.length - 1) + index;
                            // 主键现在是 symbol
                            const failedStockName = stocks[errorIndex]?.symbol || 'unknown';
                            console.error(`[Node.js] Error upserting stock name ${failedStockName}: ${result.reason?.message || result.reason}`); // Log updated
                            errorCount++;
                        }
                    });
                    console.log(`[Node.js] Processed batch up to record ${i + 1}. Current success: ${successCount}, errors: ${errorCount}`);
                    promises = [];
                }
            } catch (transformError: any) {
                 console.error(`[Node.js] Error transforming data for stock symbol ${stock.symbol}: ${transformError.message}`); // Log updated
                 errorCount++;
                 if (promises.length === batchSize || i === stocks.length - 1) {
                     promises = [];
                 }
            }
        }

        console.log(`[Node.js] Stock name data update finished. Total records processed: ${stocks.length}. Success: ${successCount}, Errors: ${errorCount}`);

    } catch (error) {
        console.error("[Node.js] An error occurred during the update process:", error);
    } finally {
        await prisma.$disconnect();
        console.log("[Node.js] Prisma client disconnected.");
    }
}

updateStockName(); 