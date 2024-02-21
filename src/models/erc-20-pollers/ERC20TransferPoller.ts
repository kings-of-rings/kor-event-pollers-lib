import { Erc20Transfer } from "@kings-of-rings/kor-contract-event-data-models";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { throwErrorIfUndefined } from "../../utils/throwErrorUndefined";
const TransferAbi = ["event Transfer(address from, address to, uint256 value)"];

export class ERC20TransferPoller {
	contractAddress: string;
	chainId: number;
	lastBlockPolled: number;
	eventsDirectory: string;
	transferEndpoint?: string;
	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, contractAddress: string, chainId: number, lastBlockPolled: number) {
		this.contractAddress = contractAddress.toLowerCase();
		this.chainId = chainId;
		this.lastBlockPolled = lastBlockPolled;
		this.eventsDirectory = eventsDirectory;
	};

	async pollBlocks(db: admin.firestore.Firestore, apiKey: string) {
		let provider = await this._getProvider(db);
		provider = throwErrorIfUndefined(provider, "No provider found") as ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider;
		await this._pollBlocks(provider, db, apiKey);
	}

	async _getProvider(db: admin.firestore.Firestore): Promise<ethers.providers.JsonRpcProvider | undefined> {
		try {
			const contractDoc = await db.collection(this.eventsDirectory).doc('erc20').get();
			const data = contractDoc.data();
			const rpcUrl = data?.rpcUrl;
			this.transferEndpoint = data?.transferEndpoint;
			this.maxBlocksQuery = data?.maxBlocksQuery || 1000;
			throwErrorIfUndefined(rpcUrl, "No rpc url found");
			return new ethers.providers.JsonRpcProvider(rpcUrl);
		} catch (error) {
			console.log('Error ', error);
			return;
		}
	}

	async _pollBlocks(provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, db: admin.firestore.Firestore, apiKey: string) {
		let currentBlock = await provider.getBlockNumber() - 1;
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > 1000) {
			currentBlock = this.lastBlockPolled + 1000;
		}
		const transferContract = new ethers.Contract(this.contractAddress, TransferAbi, provider);
		const contractFilter = transferContract.filters.Transfer();
		const logs = await transferContract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveTransferEvent(log, provider, apiKey);
		}
		this.lastBlockPolled = currentBlock;      // update contract last block polled
		const contractDoc = db.collection(`${this.eventsDirectory}/erc20/contracts`).doc(this.contractAddress);
		await contractDoc.update({
			lastBlockPolled: currentBlock,
		});
		return;
	}

	async _saveTransferEvent(log: any, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const transferEvent = new Erc20Transfer(log, this.chainId);
		if (this.transferEndpoint) {
			return await transferEvent.saveData(this.transferEndpoint, apiKey, provider);
		}
	}
}

export class ERC20TransferPollerFactory {
	static async runPoller(eventsDirectory: string, contractAddress: string, chainId: number, lastBlockPolled: number, db: admin.firestore.Firestore, apiKey: string): Promise<ERC20TransferPoller> {
		console.log('runPoller ', eventsDirectory, contractAddress, chainId, lastBlockPolled);
		const pollerInstance = new ERC20TransferPoller(eventsDirectory, contractAddress, chainId, lastBlockPolled);
		await pollerInstance.pollBlocks(db, apiKey);
		return pollerInstance;
	}
}







