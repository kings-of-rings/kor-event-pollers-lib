import { Erc20Transfer } from "@kings-of-rings/kor-contract-event-data-models";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
const TransferAbi = ["event Transfer(address from, address to, uint256 value)"];

export class ERC20TransferPoller {
  contractAddress: string;
  chainId: number;
  lastBlockPolled: number;
  isTestNet: boolean;
  contractsDir: string;
  transferEndpoint?: string;
  constructor(contractAddress: string, chainId: number, lastBlockPolled: number, isTestNet: boolean) {
    this.contractAddress = contractAddress.toLowerCase();
    this.chainId = chainId;
    this.lastBlockPolled = lastBlockPolled;
    this.isTestNet = isTestNet;
    this.contractsDir = isTestNet ? "erc20_testnet" : "erc20_mainnet";
  };

  async pollBlocks(db: admin.firestore.Firestore, apiKey: string) {
    const provider = await this._getProvider(db);
    console.log('provider ', provider);
    console.log('pollBlocks1');
    if (!provider) {
      throw new Error("No provider found");
    }
    await this._pollBlocks(provider, db, apiKey);
  }

  async _getProvider(db: admin.firestore.Firestore): Promise<ethers.JsonRpcProvider | undefined> {
    try {
      const contractDoc = await db.collection("directory").doc(this.contractsDir).get();
      const data = contractDoc.data();
      const rpc = data?.rpc;
      this.transferEndpoint = data?.transferEndpoint;
      if (!rpc) {
        throw new Error("No rpc url found");
      }
      return new ethers.JsonRpcProvider(rpc);
    } catch (error) {
      console.log('Error ', error);
      return;
    }
  }

  async _pollBlocks(provider: ethers.JsonRpcProvider, db: admin.firestore.Firestore, apiKey: string) {
    let currentBlock = await provider.getBlockNumber() - 1;
    const difference = currentBlock - this.lastBlockPolled;
    if (difference > 1000) {
      currentBlock = this.lastBlockPolled + 1000;
    }
    const transferContract = new ethers.Contract(this.contractAddress, TransferAbi, provider);
    const contractFilter = transferContract.filters.Transfer();
    const logs = await transferContract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
    for (const log of logs) {
      await this._saveTransferEvent(log, provider, db, apiKey);
    }
    this.lastBlockPolled = currentBlock;      // update contract last block polled
    const contractDoc = db.collection(`directory/${this.contractsDir}/contracts`).doc(this.contractAddress);
    await contractDoc.update({
      lastBlockPolled: currentBlock,
    });
    return;
  }

  async _saveTransferEvent(log: ethers.Log, provider: ethers.JsonRpcProvider, db: admin.firestore.Firestore, apiKey: string): Promise<unknown> {
    const transferEvent = new Erc20Transfer(log, this.chainId);
    if (this.transferEndpoint) {
      return await transferEvent.saveData(this.transferEndpoint, apiKey, provider);
    }
  }
}

export class ERC20TransferPollerFactory {
  static async runPoller(contractAddress: string, chainId: number, lastBlockPolled: number, isTestNet: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<ERC20TransferPoller> {
    const pollerInstance = new ERC20TransferPoller(contractAddress, chainId, lastBlockPolled, isTestNet);
    await pollerInstance.pollBlocks(db, apiKey);
    return pollerInstance;
  }
}







