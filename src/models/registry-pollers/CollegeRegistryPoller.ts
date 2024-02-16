import { ClaimingRequirementsSet, CollegeAdded, CollegeChanged, DraftBidIncreased, DraftBidPlaced, DraftPickClaimed, DraftResultsFinalized, DraftStakeClaimed, DraftTimeSet, ProTeamAdded, ProTeamChanged, TierChanged } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";

const EVENTS_ABI = [
	"event CollegeAdded(uint256 indexed _collegeId,string _name,string _conference,string _mascot, uint16 _tier, uint16 _royalty)",
	"event CollegeChanged(uint256 indexed _collegeId,string _name,string _conference,string _mascot, uint16 _royalty)",
	"event TierChanged(uint256 indexed _collegeId, uint256 indexed _tier)",
];

export class CollegeRegistryPoller {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	isFootball: boolean;
	eventsDirectory: string;
	pathName: string;
	contract?: ethers.Contract;
	db: admin.firestore.Firestore;

	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, chainId: number, isFootball: boolean, db: admin.firestore.Firestore) {
		this.chainId = chainId;
		this.isFootball = isFootball;
		this.eventsDirectory = eventsDirectory;
		this.pathName = "collegeRegistry";
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
		await this._pollCollegeAdded(currentBlock, provider, apiKey);
		await this._pollCollegeChanged(currentBlock, provider, apiKey);
		await this._pollTierChanged(currentBlock, provider, apiKey);

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

	async _pollCollegeAdded(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		const contractFilter = this.contract.filters.CollegeAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveCollegeAddedEvent(log, provider, apiKey);
		}
	}
	async _pollCollegeChanged(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		const contractFilter = this.contract.filters.CollegeChanged();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveCollegeChangedEvent(log, provider, apiKey);
		}
	}
	async _pollTierChanged(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		const contractFilter = this.contract.filters.TierChanged();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveTierChangedEvent(log, provider, apiKey);
		}
	} 
	async _saveCollegeAddedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		const event = new CollegeAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "collegeAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveCollegeAddedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	}

	async _saveCollegeChangedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		const event = new CollegeChanged(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "collegeChanged", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveCollegeChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	}

	async _saveTierChangedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		const event = new TierChanged(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "collegeTierChanged", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveTierChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	} 
}

export class CollegeRegistryPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, isFootball: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<CollegeRegistryPoller> {
		const pollerInstance = new CollegeRegistryPoller(eventsDirectory, chainId, isFootball, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
