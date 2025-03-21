import { createSmartAccountClient, getRequiredPrefund } from 'permissionless'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import {
  createPublicClient,
  getContract,
  getAddress,
  http,
  parseEther,
  parseGwei,
  type Hex,
  formatEther,
  formatUnits,
  parseAbiItem,
  parseAbi,
  parseUnits,
  encodeFunctionData,
  maxUint256,
} from 'viem'
import {
  entryPoint07Address,
  entryPoint06Address,
  createBundlerClient,
} from 'viem/account-abstraction'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import * as dotenv from 'dotenv'
dotenv.config()

const signingKey = process.env.SIGNINGKEY as Hex // EOA sepolia ETH
const rpcUrl = process.env.RPC_URL || '' //Infura ethereum-sepolia test network rpc url
const bundlerRpc = process.env.BUNDLER_URL || '' //Pimlico bundler and paymaster url
const eoaAccount = (process.env.EOA_WALLET || '') as `0x${string}`
const usdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' //sepolia usdc address
const secAAaddress = '0x6e9A6b9cC4eE1e803dBc3A96ba7105AE9F0b495f'

async function main() {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  })

  const paymasterClient = createPimlicoClient({
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
    transport: http(bundlerRpc),
  })

  //paymaster address : 0x0000000000000039cd5e8ae05257ce51c473ddd1
  const quotes = await paymasterClient.getTokenQuotes({
    chain: sepolia,
    tokens: [usdc],
  })
  const { paymaster } = quotes[0] // postOpGas, exchangeRate, paymaster
  console.log('paymaster address:', paymaster)

  const simpleAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner: privateKeyToAccount(signingKey),
    entryPoint: {
      address: entryPoint07Address,
      version: '0.7',
    },
    // index: BigInt(3),
  })

  const bundlerClient = createBundlerClient({
    chain: sepolia,
    account: simpleAccount,
    client: publicClient,
    transport: http(bundlerRpc),
  })

  const smartAccountClient = createSmartAccountClient({
    account: simpleAccount,
    chain: sepolia,
    paymaster: paymasterClient,
    bundlerTransport: http(bundlerRpc),
    userOperation: {
      estimateFeesPerGas: async () =>
        (await paymasterClient.getUserOperationGasPrice()).fast,
    },
  })

  const accountAddress = await simpleAccount.address
  console.log('Smart Account address:', accountAddress)

  const balance = await publicClient.getBalance({
    address: accountAddress,
  })
  console.log('Before balance:', formatEther(balance), 'ETH')

  //手續費與給予bundler之費用皆會從EntryPoint中扣款，因此須有足夠資金
  //若不使用paymaster則需先轉入資金至EntryPoint，並非AA錢包中有足夠的資金即可
  // EOA -> AA -> EntryPoint -> bundler
  // const entrypointBalance = await publicClient.readContract({
  //   address: entryPoint07Address,
  //   abi: [
  //     {
  //       inputs: [{ name: 'account', type: 'address' }],
  //       name: 'balanceOf',
  //       outputs: [{ name: '', type: 'uint256' }],
  //       stateMutability: 'view',
  //       type: 'function',
  //     },
  //   ],
  //   functionName: 'balanceOf',
  //   args: [accountAddress],
  // })

  const entrypointBalance = await publicClient.readContract({
    address: accountAddress,
    abi: parseAbi(['function getDeposit() view returns (uint256)']),
    functionName: 'getDeposit',
  })

  console.log(
    'Before balance in EntryPoint:',
    formatEther(entrypointBalance),
    'ETH',
  )

  const senderUsdcBalance = await publicClient.readContract({
    abi: parseAbi(['function balanceOf(address account) returns (uint256)']),
    address: usdc,
    functionName: 'balanceOf',
    args: [accountAddress], //address
  })

  console.log(
    'Before usdc balance :',
    formatUnits(senderUsdcBalance, 6),
    'usdc',
  )

  try {
    // const userOperation = await bundlerClient.prepareUserOperation({
    //   account: simpleAccount,
    //   calls: [
    //     {
    //       to: eoaAccount,
    //       value: parseEther('0.2'),
    //       data: '0x',
    //     },
    //   ],
    //   maxFeePerGas: parseGwei('20'),
    //   maxPriorityFeePerGas: parseGwei('1.5'),
    // })
    // console.log('UserOperation :', userOperation)

    //error - UserOperation reverted during simulation with reason: 0x
    //value ＆ maxFeePerGas都需要極小值才能通過
    const gas = await bundlerClient.estimateUserOperationGas({
      account: simpleAccount,
      calls: [
        {
          to: eoaAccount,
          value: parseEther('0.1'),
          data: '0x',
        },
      ],
      maxFeePerGas: parseGwei('20'),
      maxPriorityFeePerGas: parseGwei('1.5'),
    })

    // const gas = await bundlerClient.estimateUserOperationGas({
    //   account: simpleAccount,
    //   calls: [
    //     {
    //       to: eoaAccount,
    //       value: parseEther('0.00000001'),
    //       data: '0x',
    //     },
    //   ],
    //   maxFeePerGas: parseGwei('20'),
    //   maxPriorityFeePerGas: parseGwei('1.5'),
    // })

    console.log('UserOperation gas:', gas)

    // 查看userop詳情
    // 必須是userop hash(需至dashboard查看), 非鏈上send transaction時所得的transaction hash
    const result = await bundlerClient.getUserOperation({
      hash: '0x0d58c6b25c266a4385417eba25c5386e6887d496fbc3ce992e07676a9695e38c',
    })
    console.log('UserOperation result:', result)

    const receipt = await bundlerClient.getUserOperationReceipt({
      hash: '0x0d58c6b25c266a4385417eba25c5386e6887d496fbc3ce992e07676a9695e38c',
    })
    console.log('UserOp receipt:', receipt)

    // const estimatedCost =
    //   (BigInt(userOperation.callGasLimit) +
    //     BigInt(userOperation.verificationGasLimit) +
    //     BigInt(userOperation.preVerificationGas)) *
    //   BigInt(parseGwei('1')) // gas price
    // console.log('Estimated cost:', formatEther(estimatedCost), 'ETH')

    // 發送第一筆交易 (部署智能合約錢包)
    const depolyed_hash = await smartAccountClient.sendTransaction({
      account: simpleAccount,
      calls: [
        {
          to: accountAddress,
          value: BigInt(0),
          data: '0x',
        },
      ],
      maxFeePerGas: parseGwei('20'),
      maxPriorityFeePerGas: parseGwei('1.5'),
    })
    console.log('Transaction hash:', depolyed_hash)

    //maxFeePerGas normal:10~30 / busy:80~100
    // 僅有transferAmount會從AA中扣款，其餘支出都是從entrypoint中扣除
    const transferAmount = parseEther('0.1')
    const aa2eoa_hash = await smartAccountClient.sendTransaction({
      account: simpleAccount,
      calls: [
        {
          to: eoaAccount,
          value: transferAmount,
          data: '0x',
        },
      ],
      maxFeePerGas: parseGwei('30'),
      maxPriorityFeePerGas: parseGwei('1.5'),
      callGasLimit: 17955n,
      verificationGasLimit: 72320n,
      preVerificationGas: 50996n,
    })
    console.log('Transaction hash:', aa2eoa_hash)

    const isDeployed = await simpleAccount.isDeployed()
    console.log('Account deployed:', isDeployed)

    // 從 AA 錢包向 entrypoint 存入資金
    // AA21 didn't pay prefund
    const deposit2ep = await smartAccountClient.sendTransaction({
      account: simpleAccount,
      calls: [
        {
          to: entryPoint07Address,
          value: transferAmount,
          data: encodeFunctionData({
            abi: [parseAbiItem('function depositTo(address account) payable')],
            functionName: 'depositTo',
            args: [accountAddress],
          }),
        },
      ],
      maxFeePerGas: parseGwei('20'),
      maxPriorityFeePerGas: parseGwei('1.5'),
    })

    const usdcAmount = parseUnits('30', 6)
    const transferTx = await smartAccountClient.sendTransaction({
      account: simpleAccount,
      calls: [
        {
          to: getAddress(usdc),
          abi: parseAbi([
            'function transfer(address to, uint256 amount) returns (bool)',
          ]),
          functionName: 'transfer',
          args: [secAAaddress, usdcAmount], // 第二個 AA 錢包地址和金額
        },
      ],
      maxFeePerGas: parseGwei('20'),
      maxPriorityFeePerGas: parseGwei('1.5'),
    })

    console.log('USDC Transfer transaction hash:', transferTx)

    // const deposit2ep = await smartAccountClient.sendTransaction({
    //   account: simpleAccount,
    //   calls: [
    //     {
    //       to: accountAddress,
    //       value: transferAmount,
    //       data: encodeFunctionData({
    //         abi: parseAbi(['function addDeposit() payable']),
    //         functionName: 'addDeposit',
    //         args: [],
    //       }),
    //     },
    //   ],
    //   callGasLimit: 26011n,
    //   preVerificationGas: 51688n,
    //   verificationGasLimit: 723200n,
    //   maxFeePerGas: parseGwei('20'),
    //   maxPriorityFeePerGas: parseGwei('1.5'),
    // })

    console.log('Deposit transaction hash:', deposit2ep)

    // const txHash = await smartAccountClient.sendTransaction({
    //   account: simpleAccount,
    //   calls: [
    //     {
    //       to: getAddress(usdc),
    //       abi: parseAbi(['function approve(address,uint)']),
    //       functionName: 'approve',
    //       args: [paymaster, maxUint256],
    //     },
    //   ],
    //   paymasterContext: {
    //     token: usdc,
    //   },
    //   maxFeePerGas: parseGwei('20'),
    //   maxPriorityFeePerGas: parseGwei('1.5'),
    // })

    const txHash = await smartAccountClient.sendTransaction({
      account: simpleAccount,
      calls: [
        {
          to: eoaAccount,
          value: transferAmount,
          data: '0x',
        },
      ],
      paymasterContext: {
        token: usdc,
      },
      maxFeePerGas: parseGwei('30'),
      maxPriorityFeePerGas: parseGwei('1.5'),
    })

    console.log(`transactionHash: ${txHash}`)

    const afterBalance = await publicClient.getBalance({
      address: accountAddress,
    })
    console.log('After balance:', formatEther(afterBalance), 'ETH')

    const after_entrypointBalance = await publicClient.readContract({
      address: entryPoint07Address,
      abi: [
        {
          inputs: [{ name: 'account', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'balanceOf',
      args: [accountAddress],
    })

    console.log(
      'After balance in EntryPoint:',
      formatEther(after_entrypointBalance),
      'ETH',
    )

    const total_aa_cost = balance - afterBalance
    console.log(
      'Total AA cost(transfer amount):',
      formatEther(total_aa_cost),
      'ETH',
    )

    const total_ep_cost = entrypointBalance - after_entrypointBalance
    console.log(
      'Total entrypoint cost(gas fee):',
      formatEther(total_ep_cost),
      'ETH',
    )

    const afterUsdcBalance = await publicClient.readContract({
      abi: parseAbi(['function balanceOf(address account) returns (uint256)']),
      address: usdc,
      functionName: 'balanceOf',
      args: [accountAddress], //address
    })

    console.log(
      'After usdc balance :',
      formatUnits(afterUsdcBalance, 6),
      'usdc',
    )

    const total_usdc_cost = BigInt(senderUsdcBalance) - BigInt(afterUsdcBalance)
    console.log(
      'Total usdc cost(gas fee):',
      formatUnits(total_usdc_cost, 6),
      'usdc',
    )
  } catch (error) {
    console.error('Error:', error)
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
  }
}

export default main()
