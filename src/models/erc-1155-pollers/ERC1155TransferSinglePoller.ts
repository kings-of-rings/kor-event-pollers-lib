import { TransferSingleEventERC1155Abi } from "@kings-of-rings/kor-abis-lib";
import { Erc1155TransferSingle } from "@kings-of-rings/kor-contract-event-data-models";
import { ethers } from "ethers";
import * as admin from "firebase-admin";

export class ERC1155TransferSinglePoller {
	contractAddress: string;
	chainId: number;
	lastBlockPolled: number;
	isTestNet: boolean;
	contractsDir: string;
	transferEndpoint?: string;
	maxBlocksQuery = 1000;
	constructor(contractAddress: string, chainId: number, lastBlockPolled: number, isTestNet: boolean) {
		this.contractAddress = contractAddress.toLowerCase();
		this.chainId = chainId;
		this.lastBlockPolled = lastBlockPolled;
		this.isTestNet = isTestNet;
		this.contractsDir = isTestNet ? "erc1155_testnet" : "erc1155_mainnet";
	};

	async pollBlocks(db: admin.firestore.Firestore, apiKey: string) {
		const provider = await this._getProvider(db);
		if (!provider) {
			throw new Error("No provider found");
		}
		await this._pollBlocks(provider, db, apiKey);
	}

	async _getProvider(db: admin.firestore.Firestore): Promise<ethers.providers.JsonRpcProvider | undefined> {
		try {
			const contractDoc = await db.collection("directory").doc(this.contractsDir).get();
			const data = contractDoc.data();
			const rpc = data?.rpc;
			this.transferEndpoint = data?.transferEndpoint;
			this.maxBlocksQuery = data?.maxBlocksQuery || 1000;
			if (!rpc) {
				throw new Error("No rpc url found");
			}
			return new ethers.providers.JsonRpcProvider(rpc);
		} catch (error) {
			console.log('Error ', error);
			return;
		}
	}

	async _pollBlocks(provider: ethers.providers.JsonRpcProvider, db: admin.firestore.Firestore, apiKey: string) {
		let currentBlock = await provider.getBlockNumber() - 1;
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > 1000) {
			currentBlock = this.lastBlockPolled + 1000;
		}
		const transferContract = new ethers.Contract(this.contractAddress, TransferSingleEventERC1155Abi, provider);
		const contractFilter = transferContract.filters.TransferSingle();
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

	async _saveTransferEvent(log: ethers.Log, provider: ethers.providers.JsonRpcProvider, db: admin.firestore.Firestore, apiKey: string): Promise<unknown> {
		const transferEvent = new Erc1155TransferSingle(log, this.chainId);
		if (this.transferEndpoint) {
			return await transferEvent.saveData(this.transferEndpoint, apiKey, provider);
		}
	}
}

export class ERC1155TransferSinglePollerFactory {
	static async runPoller(contractAddress: string, chainId: number, lastBlockPolled: number, isTestNet: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<ERC1155TransferSinglePoller> {
		const pollerInstance = new ERC1155TransferSinglePoller(contractAddress, chainId, lastBlockPolled, isTestNet);
		await pollerInstance.pollBlocks(db, apiKey);
		return pollerInstance;
	}
}







