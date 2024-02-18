
import { DraftTimeSet, DraftBidIncreased, DraftBidPlaced } from "@kings-of-rings/kor-contract-event-data-models/lib";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";

const EVENTS_ABI = [
	"event BurnBidIncreased(uint256 indexed _bidId, address indexed _bidder, uint256 indexed _tokenId, uint256 _increasedAmount, uint256 _totalBid, uint16 _year,bool _isFootball)",
	"event BurnBidPlaced(uint256 indexed _bidId, address indexed _bidder, uint256 indexed _tokenId, uint256 _bidAmount, uint256 _bidCount, uint16 _year, bool _isFootball)",
	"event BurnAuctionTimeSet(uint16 _year, bool _isFootball, uint256 _start, uint256 _end)",
	"event RemoveBid(uint256 indexed _bidId, address indexed _bidder, uint256 indexed _tokenId, uint256 _bidAmount, uint256 _year, bool _isFootball)"
];


export class CollectibleBurnAuctionPoller {
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
		this.docName = isFootball ? "collegeBurnAuctionFootball" : "collegeBurnAuctionBasketball";
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
			await this._pollBurnBidIncreased(currentBlock, provider, apiKey);
			await this._pollBurnBidPlaced(currentBlock, provider, apiKey);
			await this._pollBurnAuctionTimeSet(currentBlock, provider, apiKey);
			await this._pollRemoveBid(currentBlock, apiKey);

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

	async _pollBurnBidIncreased(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		if (!this.contract) {
			throw new Error("No contract found");
		}
		const contractFilter = this.contract.filters.BurnBidIncreased();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveBurnBidIncreasedEvent(log, provider, apiKey);
		}
	}
	async _pollBurnBidPlaced(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		if (!this.contract) {
			throw new Error("No contract found");
		}
		const contractFilter = this.contract.filters.BurnBidPlaced();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveBurnBidPlacedEvent(log, provider, apiKey);
		}
	}
	async _pollBurnAuctionTimeSet(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		if (!this.contract) {
			throw new Error("No contract found");
		}
		const contractFilter = this.contract.filters.BurnAuctionTimeSet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveBurnAuctionTimeSetEvent(log, provider, apiKey);
		}
	}
	async _pollRemoveBid(currentBlock: number, apiKey: string) {
		if (!this.contract) {
			throw new Error("No contract found");
		}
		const contractFilter = this.contract.filters.RemoveBid();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveRemoveBidEvent(log, apiKey);
		}
	}

	async _saveBurnBidIncreasedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new DraftTimeSet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "burnBidIncreased", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for save burn bid increased event");
		}
		return await event.saveData(endpoint, apiKey, provider);

	}
	async _saveBurnBidPlacedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const draftBidIncreasedEvent = new DraftBidIncreased(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "burnBidPlaced", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for save burn bid placed event");
		}
		return await draftBidIncreasedEvent.saveData(endpoint, apiKey, provider);

	}
	async _saveBurnAuctionTimeSetEvent(log: ethers.Event, provider: any, apiKey: string): Promise<unknown> {
		const draftBidPlacedEvent = new DraftBidPlaced(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "burnAuctionTimeSet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for save burn auction time set event");
		}
		return await draftBidPlacedEvent.saveData(endpoint, apiKey, provider);
	}

	async _saveRemoveBidEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		//TODO Implement
		return;
	}
}

export class CollectibleBurnAuctionPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, isFootball: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<CollectibleBurnAuctionPoller> {
		const pollerInstance = new CollectibleBurnAuctionPoller(eventsDirectory, chainId, isFootball, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
