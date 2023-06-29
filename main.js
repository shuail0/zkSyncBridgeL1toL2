const { Wallet, Provider } = require('zksync-web3');
const zksync = require('zksync-web3');
const ethers = require('ethers');
const { defaultAbiCoder } = require('ethers').utils;
const { BigNumber } = require('ethers');
const { approveToken } = require('./erc20utils');
const fs = require('fs');
const { convertCSVToObjectSync, sleep, getRandomFloat, saveLog } = require('./utils');
const { count } = require('console');

let CONFIG = JSON.parse(fs.readFileSync('./config.json'));
let RPC;
if (CONFIG.baseconfig.test){
    console.log('test')
    RPC = CONFIG.Network.testNetwork.RPC;
} else{
    console.log('main')
    RPC = CONFIG.Network.mainNetwork.RPC; 
};


// ------------配置RPC-----------

const provider = new Provider(RPC.zks);
const ethereumProvider = new ethers.getDefaultProvider(RPC.eth);
// -----------------------------------------


// 程序开始运行
console.log('正在打开钱包文件...')
//  打开地址文件
const walletData = convertCSVToObjectSync(CONFIG.baseconfig.walletPath);
let gasPrice;
async function main() {
    
    console.log('开始循环...')
    for(wt of walletData){
        CONFIG = JSON.parse(fs.readFileSync('./config.json'));

        // 循环获取GAS
        while (true) {
            console.log('开始获取当前主网GAS');
            gasPrice = parseFloat(ethers.utils.formatUnits(await ethereumProvider.getGasPrice(), 'gwei'));
            console.log(`当前gasPrice：${gasPrice}`);
            if (gasPrice > CONFIG.baseconfig.maxGasPrice) {
                console.log(`gasPrice高于设定的最大值${CONFIG.baseconfig.maxGasPrice}，程序暂停30分钟`)
                await sleep(30);
            } else {
                console.log(`gasPrice低于${CONFIG.baseconfig.maxGasPrice}，程序继续执行`) 
                break;
            };
        }

        try {
            console.log(`帐号：${wt.Wallet}, 地址：${wt.Address}， 开始执行跨链...`);

            // 创建钱包
            const wallet = new zksync.Wallet(wt.PrivateKey, provider, ethereumProvider);
            // 查询账户余额
            console.log('开始查询账户L1 ETH余额.')
            const ethBalance = await wallet.getBalanceL1();
            console.log(`成功查询账户ETH余额，余额：${ethers.utils.formatEther(ethBalance).toString()}`);

            // 计算预留gas
            const gasLimit = ethers.BigNumber.from(149210);
            const gasPriceMultiplier = 1.8;
            const gasPriceInteger = ethers.utils.parseUnits((gasPrice * gasPriceMultiplier).toFixed(4), 'gwei');
            const bridgeGasFee = gasLimit.mul(gasPriceInteger);
            
            
            console.log('预留gas：', ethers.utils.formatEther(bridgeGasFee).toString())

            // 检查余额是否充足
            if (bridgeGasFee.gt(ethBalance)){
                throw new Error('当前账户余额小于所需支付的Gas费用');
            }
            const bridgeAmount = ethBalance.sub(bridgeGasFee);

            // 存入资金（跨链）
            const deposit = await wallet.deposit({
                token: zksync.utils.ETH_ADDRESS,
                amount:bridgeAmount,
                });

                // 可以用事物句柄跟踪其状态
            const ethereumTxReceipt = await deposit.waitL1Commit();
            console.log(`主网交易成功，哈希: ${ethereumTxReceipt.transactionHash}`)

            // // 等待zkSync处理存款
            const depositRecript = await deposit.wait();
            console.log(`depositRecript: ${depositRecript}`)


            // 查询L2余额
            console.log('开始查询L2余额...');
            const tokenBalance = ethers.utils.formatEther(await wallet.getBalance())
            console.log(`查询成功，L2余额：${tokenBalance}，开始授权...`);

            // 保存日志
            const currentTime = new Date().toISOString();
            const logMessage = `成功执行 - 时间: ${currentTime}, 钱包名称: ${wt.Wallet},钱包地址: ${wt.address}`;
            saveLog(`${CONFIG.baseconfig.projectName}Sucess`, logMessage);
            // 暂停
            const sleepTime = getRandomFloat(CONFIG.baseconfig.minSleepTime, CONFIG.baseconfig.maxSleepTime).toFixed(1); 
            console.log(logMessage, '程序暂停',sleepTime,'分钟后继续执行');
            await sleep(sleepTime);
        } catch (error) {
            // 保存错误日志
            const currentTime = new Date().toISOString();
            const logMessage = `成功失败 - 时间: ${currentTime}, 钱包名称: ${wt.Wallet},钱包地址: ${wt.address},错误信息: ${error}`;
            saveLog(`${CONFIG.baseconfig.projectName}Error`, logMessage);
        }

    }

}

main()
