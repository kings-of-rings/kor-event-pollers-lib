import { CollectibleSeriesFaucetContractAdded, CollectibleSeriesTokenContractAdded, DraftControllerAdded, RingSeriesTokenContractAdded } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const EVENTS_ABI = [
	"event DraftControllerAdded(uint16 indexed _year, address indexed _address, bool indexed _isFootball)",
	"event RingSeriesTokenContractAdded(uint16 indexed _year, address indexed _address)",
	"event CollectibleSeriesFaucetContractAdded(uint16 indexed _year, address indexed _address, bool indexed _isFootball)",
	"event CollectibleSeriesTokenContractAdded(uint16 indexed _year, address indexed _address)"
];
export class KoRDirectoryPoller {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	eventsDirectory: string;
	pathName: string;
	contract?: ethers.Contract;
	db: admin.firestore.Firestore;

	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore) {
		this.chainId = chainId;
		this.eventsDirectory = eventsDirectory;
		this.pathName = "korDirectory";
		this.db = db;
	};

	async pollBlocks(apiKey: string) {
		const provider = await this._getProvider();
		if (!provider) {
			throw new Error("No provider found");
		}
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		let currentBlock = await provider.getBlockNumber() - 1;
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > this.maxBlocksQuery) {
			currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
		}
		await this._pollDraftControllerAddedAdded(currentBlock, apiKey);
		await this._pollRingSeriesTokenContractAddedChanged(currentBlock, apiKey);
		await this._pollCollectibleSeriesFaucetContractAdded(currentBlock, provider, apiKey);
		await this._pollCollectibleSeriesTokenContractAdded(currentBlock, provider, apiKey);

		this.lastBlockPolled = currentBlock;	  // update contract last block polled
		const contractDoc = this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.pathName);
		await contractDoc.update({
			lastBlockPolled: currentBlock,
		});
		return;
	}

	async _getProvider(): Promise<ethers.providers.JsonRpcProvider | undefined> {
		try {
			const contractDoc = await this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.pathName).get();
			const data = contractDoc.data();
			const rpcUrl = data?.rpcUrl;
			this.lastBlockPolled = data?.lastBlockPolled;
			this.contractAddress = data?.contractAddress.toLowerCase();
			this.maxBlocksQuery = data?.maxBlocksQuery || 1000;
			if (!rpcUrl) {
				throw new Error("No rpc url found");
			}
			return new ethers.providers.JsonRpcProvider(rpcUrl);
		} catch (error) {
			console.log('Error ', error);
			return;
		}
	}

	async _pollDraftControllerAddedAdded(currentBlock: number, apiKey: string) {
		const contractFilter = this.contract.filters.DraftControllerAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveDraftControllerAddedEvent(log, apiKey);
		}
	}
	async _pollRingSeriesTokenContractAddedChanged(currentBlock: number, apiKey: string) {
		const contractFilter = this.contract.filters.RingSeriesTokenContractAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveRingSeriesTokenContractAddedEvent(log, apiKey);
		}
	}
	async _pollCollectibleSeriesFaucetContractAdded(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		const contractFilter = this.contract.filters.CollectibleSeriesFaucetContractAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveCollectibleSeriesFaucetContractAddedEvent(log, apiKey);
		}
	}
	async _pollCollectibleSeriesTokenContractAdded(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		const contractFilter = this.contract.filters.CollectibleSeriesTokenContractAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveCollectibleSeriesTokenContractAddedEvent(log, apiKey);
		}
	}
	async _saveDraftControllerAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new DraftControllerAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftControllerAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveDraftControllerAddedEvent");
		}
		return await event.saveData(endpoint, apiKey);
	}

	async _saveRingSeriesTokenContractAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new RingSeriesTokenContractAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "ringSeriesTokenContractAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveRingSeriesTokenContractAddedEvent");
		}
		return await event.saveData(endpoint, apiKey);
	}
	async _saveCollectibleSeriesFaucetContractAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new CollectibleSeriesFaucetContractAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "collectibleSeriesFaucetContractAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveCollectibleSeriesFaucetContractAddedEvent");
		}
		return await event.saveData(endpoint, apiKey);
	}
	async _saveCollectibleSeriesTokenContractAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new CollectibleSeriesTokenContractAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "collectibleSeriesTokenContractAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveCollectibleSeriesTokenContractAddedEvent");
		}
		return await event.saveData(endpoint, apiKey);
	}
}

export class KoRDirectoryPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore, apiKey: string): Promise<KoRDirectoryPoller> {
		const pollerInstance = new KoRDirectoryPoller(eventsDirectory, chainId, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
