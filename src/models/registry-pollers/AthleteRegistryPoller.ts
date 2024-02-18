
import { AthleteAdded, AthleteNameChanged, AthleteCollegeChanged, AthleteProTeamChanged, AthleteActiveYearAdded } from "@kings-of-rings/kor-contract-event-data-models/lib";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const EVENTS_ABI = [
	"event ActiveYearAdded(uint256 indexed _athleteId, uint16 indexed _year)",
	"event AthleteAdded(uint256 indexed _athleteId, bool indexed _isFootball, string _displayName, string _lastName, string _middleName, string _firstName)",
	"event AthleteNameChanged(uint256 indexed _athleteId,string _displayName,string _lastName,string _middleName,string _firstName)",
	"event AthleteCollegeChanged(uint256 indexed _athleteId,uint256 indexed _collegeId,uint256 indexed _jerseyNumber,uint16 _position)",
	"event AthleteProTeamChanged(uint256 indexed _athleteId,uint256 indexed _proTeamId,uint256 indexed _jerseyNumber,uint16 _position)"
];

export class AthleteRegistryPoller {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	eventsDirectory: string;
	pathName: string;
	contract?: ethers.Contract;
	ethersProvider?: any;
	db: admin.firestore.Firestore;

	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore) {
		this.chainId = chainId;
		this.eventsDirectory = eventsDirectory;
		this.pathName = "athleteRegistry";
		this.db = db;
	};

	async pollBlocks(apiKey: string) {
		this.ethersProvider = await this._getProvider();
		if (!this.ethersProvider) {
			throw new Error("No provider found");
		}
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, this.ethersProvider);
		let currentBlock = await this.ethersProvider.getBlockNumber() - 1;
		const difference = currentBlock - this.lastBlockPolled;
		if (difference > this.maxBlocksQuery) {
			currentBlock = this.lastBlockPolled + this.maxBlocksQuery;
		}
		await this._pollActiveYearAdded(currentBlock, apiKey);
		await this._pollAthleteAdded(currentBlock, apiKey);
		await this._pollAthleteNameChanged(currentBlock, apiKey);
		await this._pollAthleteCollegeChanged(currentBlock, apiKey);
		await this._pollAthleteProTeamChanged(currentBlock, apiKey);

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

	async _pollActiveYearAdded(currentBlock: number, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI);
		const contractFilter = this.contract.filters.ActiveYearAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveActiveYearAddedEvent(log, apiKey);
		}
	}

	async _pollAthleteAdded(currentBlock: number, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI);
		const contractFilter = this.contract.filters.AthleteAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteAddedEvent(log, apiKey);
		}
	}

	async _pollAthleteNameChanged(currentBlock: number, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI);
		const contractFilter = this.contract.filters.AthleteNameChanged();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteNameChangedEvent(log, apiKey);
		}
	}

	async _pollAthleteCollegeChanged(currentBlock: number, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI);
		const contractFilter = this.contract.filters.AthleteCollegeChanged();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteCollegeChangedEvent(log, apiKey);
		}
	}

	async _pollAthleteProTeamChanged(currentBlock: number, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI);
		const contractFilter = this.contract.filters.AthleteProTeamChanged();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthleteProTeamChangedEvent(log, apiKey);
		}
	}

	async _saveAthleteAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AthleteAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveAthleteAddedEvent");
		}
		return await event.saveData(endpoint, apiKey, this.ethersProvider);
	}

	async _saveAthleteNameChangedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AthleteNameChanged(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteNameChanged", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveAthleteNameChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, this.ethersProvider);
	}

	async _saveAthleteCollegeChangedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AthleteCollegeChanged(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteCollegeChanged", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveAthleteCollegeChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, this.ethersProvider);
	}

	async _saveAthleteProTeamChangedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AthleteProTeamChanged(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteProTeamChanged", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveAthleteProTeamChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, this.ethersProvider);
	}

	async _saveActiveYearAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AthleteActiveYearAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athleteActiveYearAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveActiveYearAddedEvent");
		}
		return await event.saveData(endpoint, apiKey, this.ethersProvider);
	}
}

export class AthleteRegistryPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore, apiKey: string): Promise<AthleteRegistryPoller> {
		const pollerInstance = new AthleteRegistryPoller(eventsDirectory, chainId, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
