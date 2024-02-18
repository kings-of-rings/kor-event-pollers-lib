
import { AthleteRingSeriesQtySet, AthleteRingSeriesEligibilitySet, RingSeriesYearAdded } from "@kings-of-rings/kor-contract-event-data-models/lib";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";

const EVENTS_ABI = [
	"event AthleteRingSeriesQtySet(uint256 indexed _athleteId, uint256 _maxQty, uint256 _athleteQty)",
	"event AthleteRingSeriesEligibilitySet(uint256 indexed _athleteId, bool _isEligible)",
	"event RingSeriesYearAdded(uint256 indexed _athleteId, uint16 indexed _year)"
];

export class RingSeriesManagerPoller {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	eventsDirectory: string;
	docName: string = "ringSeriesManager";
	paused: boolean = false;
	contract?: ethers.Contract;
	db: admin.firestore.Firestore;

	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore) {
		this.chainId = chainId;
		this.eventsDirectory = eventsDirectory;
		this.db = db;
	};

	async pollBlocks(apiKey: string) {
		if (!this.paused) {
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
			await this._pollAthleteRingSeriesQtySet(currentBlock, provider, apiKey);
			await this._pollAthleteRingSeriesEligibilitySet(currentBlock, provider, apiKey);
			await this._pollRingSeriesYearAdded(currentBlock, provider, apiKey);

			this.lastBlockPolled = currentBlock;	  // update contract last block polled
			const contractDoc = this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.docName);
			await contractDoc.update({
				lastBlockPolled: currentBlock,
			});
		}
		return;
	}

	async _getProvider(): Promise<ethers.providers.JsonRpcProvider | undefined> {
		try {
			const contractDoc = await this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.docName).get();
			const data = contractDoc.data();
			const rpcUrl = data?.rpcUrl;
			this.lastBlockPolled = data?.lastBlockPolled;
			this.contractAddress = data?.contractAddress.toLowerCase();
			this.paused = data?.paused || false;
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

	async _pollAthleteRingSeriesQtySet(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		const contractFilter = this.contract.filters.AthleteRingSeriesQtySet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteRingSeriesQtySetEvent(log, provider, apiKey);
		}
	}
	async _pollAthleteRingSeriesEligibilitySet(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		const contractFilter = this.contract.filters.AthleteRingSeriesEligibilitySet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteRingSeriesEligibilitySetEvent(log, provider, apiKey);
		}
	}
	async _pollRingSeriesYearAdded(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		const contractFilter = this.contract.filters.RingSeriesYearAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteRingSeriesQtySetEvent(log, provider, apiKey);
		}
	}

	async _saveAthleteRingSeriesQtySetEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new AthleteRingSeriesQtySet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteRingSeriesQtySet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for save athlete ring series qty set event");
		}
		return await event.saveData(endpoint, apiKey);

	}

	async _saveAthleteRingSeriesEligibilitySetEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new AthleteRingSeriesEligibilitySet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteRingSeriesEligibilitySet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for save athlete ring series eligibility set event");
		}
		return await event.saveData(endpoint, apiKey);

	}
	async _saveRingSeriesYearAddedEvent(log: ethers.Event, provider: any, apiKey: string): Promise<unknown> {
		const event = new RingSeriesYearAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "ringSeriesYearAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for save ring series year added event");
		}
		return await event.saveData(endpoint, apiKey);
	}
}

export class RingSeriesManagerPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore, apiKey: string): Promise<RingSeriesManagerPoller> {
		const pollerInstance = new RingSeriesManagerPoller(eventsDirectory, chainId, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
