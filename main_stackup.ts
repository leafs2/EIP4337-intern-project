import { ethers, JsonRpcProvider } from 'ethers'
import { V06 } from 'userop'
import * as dotenv from 'dotenv'

dotenv.config()
const signingKey = process.env.SIGNINGKEY || '' // EOA sepolia ETH
const rpcUrl = process.env.RPC_URL || '' //Infura ethereum-sepolia test network rpc url
const bundlerRpc = process.env.BUNDLER_URL || '' //Pimlico bundler and paymaster url

async function main() {
  //create userop builder

  const provider = new JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(signingKey, provider)

  /*
        wallet contract account developed by EntryPoint
        call SimpleAccountFactory.sol createAccount function (CREATE2) to calculate new deploy address
    */
  const account = new V06.Account.Instance({
    ...V06.Account.Common.SimpleAccount.base(provider, signer),
    bundlerClient: new JsonRpcProvider(bundlerRpc),
    factoryAddress: '0x9406Cc6185a346906296840746125a0E44976454',
  })

  const address = await account.getSender()
  console.log(`Smart Account address: ${address}`)

  //create calls

  const tx = await signer.sendTransaction({
    to: '0x2D7cac1C3caf43307aB11e3FF8a3c86048047628',
    value: ethers.parseEther('0.03'),
  })
  await tx.wait()
  console.log('已轉入 ETH 到智能錢包')

  // const build = await account
  //     .encodeCallData('execute', [
  //     address, // 發送給自己的地址
  //     0n, // 不轉移任何 ETH
  //     '0x', // 空數據
  //     ])
  //     .buildUserOperation()

  // 3. 建立 UserOperation

  // const signAddress = '0xF6c6f66528BA9DD00583fb74525481f4275273c8' // 接收地址
  // //   const build = await account
  // //     .encodeCallData('execute', [signAddress, ethers.parseEther('0.005'), '0x'])
  // //     .buildUserOperation()
  // //   console.log(`buildUserOperation: ${build}`)
  // //   // 3. 發送 UserOperation 來觸發部署
  // const iface = new ethers.Interface([
  //   'function transfer(address to, uint256 amount) returns (bool)',
  // ])

  // const transferCalldata = iface.encodeFunctionData('transfer', [
  //   signAddress,
  //   ethers.parseEther('0.005'),
  // ]) as `0x${string}`

  // const build = await account
  //   .encodeCallData('execute', [
  //     signAddress, // target address
  //     0n, // value in ETH
  //     transferCalldata, // transfer function calldata
  //   ])
  //   .buildUserOperation()
  // console.log(`buildUserOperation: ${build}`)

  // const hash = await account.sendUserOperation()
  // console.log('Deployment triggered:', hash)

  // 4. 發送 UserOperation
  // const userOpHash = await account.sendUserOperation();
  // console.log(`UserOperation hash: ${userOpHash}`);

  //sent userop
}

export default main()
