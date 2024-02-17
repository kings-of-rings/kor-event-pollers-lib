import { ClaimingRequirementsSet, DraftBidIncreased, DraftBidPlaced, DraftPickClaimed, DraftResultsFinalized, DraftStakeClaimed, DraftTimeSet, ProTeamAdded, ProTeamChanged } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const ProTeamAddedAbi = ["event TeamAdded(uint256 indexed _teamId, bool indexed _isFootball, string _name, string _mascot,  string _conference)"];
const ProTeamChangedAbi = ["event TeamChanged(uint256 indexed _teamId, bool indexed _isFootball, string _name, string _mascot, string _conference)"];

export class ProRegistryPoller {
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
		this.pathName = "proTeamsRegistry";
		this.db = db;
	};

	async pollBlocks(apiKey: string) {
		const provider = await this._getProvider();
		if (!provider) {
			throw new Error("No provider found");
		}
		let currentBlock = await provider.getBlockNumber() - 1;
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > this.maxBlocksQuery) {
			currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
		}
		await this._pollTeamAdded(currentBlock, provider, apiKey);
		await this._pollTeamChanged(currentBlock, provider, apiKey);

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

	async _pollTeamAdded(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, ProTeamAddedAbi, provider);
		const contractFilter = this.contract.filters.TeamAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveTeamAddedEvent(log, provider, apiKey);
		}
	}
	async _pollTeamChanged(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, ProTeamChangedAbi, provider);
		const contractFilter = this.contract.filters.TeamChanged();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveTeamChangedEvent(log, provider, apiKey);
		}
	}
	async _saveTeamAddedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		const event = new ProTeamAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "proTeamAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveTeamAddedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	}

	async _saveTeamChangedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		const event = new ProTeamChanged(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "proTeamChanged", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveTeamChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	}
}

export class ProRegistryPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore, apiKey: string): Promise<ProRegistryPoller> {
		const pollerInstance = new ProRegistryPoller(eventsDirectory, chainId, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
