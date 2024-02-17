import { AccessCreditsAddressSet, AthletePriceSet, ClaimingRequirementsSet, CollectibleFaucetSale, CollectibleFaucetTimeSet, DraftBidIncreased, DraftBidPlaced, DraftPickClaimed, DraftResultsFinalized, DraftStakeClaimed, DraftTimeSet, FaucetLevelAdded } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const EVENTS_ABI = [
	"event AccessCreditsAddress(uint16 _year, bool _isFootball, address _accessCreditsAddress)",
	"event AthletePriceSet(uint256 _athleteId, uint16 _year, uint256 _price)",
	"event CollectibleFaucetTimeSet(uint256 _open, uint256 _freeAgency, uint256 _close, uint16 _year, bool _isFootball)",
	"event LevelAdded(uint256 _level,uint256 _levelEnds, uint256 _qtyAllowed,uint256 _increasePercentage,uint16 _year,bool _isFootball)",
	"event CollectibleFaucetSale(uint256 _saleId,uint256 _athleteId,address _buyer,uint256 _qty,uint256 _totalCost,uint16 _year,bool _isFootball)"
];
export class CollectibleFaucetPoller {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	isFootball: boolean;
	eventsDirectory: string;
	docName: string;
	paused: boolean = false;
	contract?: ethers.Contract;
	db: admin.firestore.Firestore;

	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, chainId: number, isFootball: boolean, db: admin.firestore.Firestore) {
		this.chainId = chainId;
		this.isFootball = isFootball;
		this.eventsDirectory = eventsDirectory;
		this.docName = isFootball ? "collectibleSeriesFaucetFootball" : "collectibleSeriesFaucetBasketball";
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
			await this._pollAccessCreditsAddress(currentBlock, apiKey);
			await this._pollAthletePriceSet(currentBlock, apiKey);
			await this._pollCollectibleFaucetTimeSet(currentBlock, apiKey);
			await this._pollLevelAdded(currentBlock, apiKey);
			await this._pollCollectibleFaucetSale(currentBlock, provider, apiKey);

			this.lastBlockPolled = currentBlock;	  // update contract last block polled
			const contractDoc = this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.docName);
			await contractDoc.update({
				lastBlockPolled: currentBlock,
			});
			return;
		}
	}

	async _getProvider(): Promise<ethers.providers.JsonRpcProvider | undefined> {
		try {
			const contractDoc = await this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.docName).get();
			const data = contractDoc.data();
			const rpcUrl = data?.rpcUrl;
			this.lastBlockPolled = data?.lastBlockPolled;
			this.contractAddress = data?.contractAddress.toLowerCase();
			this.maxBlocksQuery = data?.maxBlocksQuery || 1000;
			this.paused = data?.paused || false;
			if (!rpcUrl) {
				throw new Error("No rpc url found");
			}
			return new ethers.providers.JsonRpcProvider(rpcUrl);
		} catch (error) {
			console.log('Error ', error);
			return;
		}
	}

	async _pollAccessCreditsAddress(currentBlock: number, apiKey: string) {

		const contractFilter = this.contract.filters.AccessCreditsAddress();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAccessCreditsAddressEvent(log, apiKey);
		}
	}
	async _pollAthletePriceSet(currentBlock: number, apiKey: string) {
		const contractFilter = this.contract.filters.AthletePriceSet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveAthletePriceSetEvent(log, apiKey);
		}
	}
	async _pollCollectibleFaucetTimeSet(currentBlock: number, apiKey: string) {
		const contractFilter = this.contract.filters.CollectibleFaucetTimeSet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveCollectibleFaucetTimeSetEvent(log, apiKey);
		}
	}
	async _pollLevelAdded(currentBlock: number, apiKey: string) {
		const contractFilter = this.contract.filters.LevelAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveLevelAddedEvent(log, apiKey);
		}
	}
	async _pollCollectibleFaucetSale(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		const contractFilter = this.contract.filters.CollectibleFaucetSale();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveCollectibleFaucetSaleEvent(log, provider, apiKey);
		}
	}

	async _saveAccessCreditsAddressEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AccessCreditsAddressSet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "accessCreditsAddress", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for accessCreditsAddressEvent");
		}
		return await event.saveData(endpoint, apiKey);

	}
	async _saveAthletePriceSetEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new AthletePriceSet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athletePriceSet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for athletePriceSetEvent");
		}
		return await event.saveData(endpoint, apiKey);

	}
	async _saveCollectibleFaucetTimeSetEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new CollectibleFaucetTimeSet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "collectibleFaucetTimeSet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for collectibleFaucetTimeSetEvent");
		}
		return await event.saveData(endpoint, apiKey);

	}
	async _saveLevelAddedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		const event = new FaucetLevelAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "faucetLevelAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for faucetLevelAddedEvent");
		}
		return await event.saveData(endpoint, apiKey);

	}
	async _saveCollectibleFaucetSaleEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new CollectibleFaucetSale(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "faucetSale", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for collectibleFaucetSaleEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);

	}
}

export class CollectibleFaucetPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, isFootball: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<CollectibleFaucetPoller> {
		const pollerInstance = new CollectibleFaucetPoller(eventsDirectory, chainId, isFootball, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
