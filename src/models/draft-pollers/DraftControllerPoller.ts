import { ClaimingRequirementsSet, DraftBidIncreased, DraftBidPlaced, DraftPickClaimed, DraftResultsFinalized, DraftStakeClaimed, DraftTimeSet } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const DraftTimeSetAbi = ["event DraftTimeSet(uint256 _startTs, uint256 _endTs, uint256 _year, bool _isFootball)"];
const DraftBidIncreasedAbi = ["event DraftBidIncreased(uint256 indexed _bidId, address indexed _bidder, uint256 indexed _duration, uint256 _amountAdded,uint256 _points,uint256 _year,bool _isFootball)"];
const DraftBidPlacedAbi = ["event DraftBidPlaced(uint256 indexed _bidId,address indexed _bidder,uint256 indexed _duration,uint256 _amount,uint256 _points,uint256 _year,bool _isFootball)"];
const ResultsFinalAbi = ["event DraftResultsFinalized(bool _resultsFinal, uint256 _year, bool _isFootball)"];
const ClaimingRequirementsSetAbi = ["event ClaimingRequirementsSet(uint256 indexed _tokenId,uint256 indexed _year,bool indexed _isFootball, uint256 _amount)"];
const DraftPickClaimedAbi = ["event DraftPickClaimed(address indexed _claimingAddress,uint256 indexed _tokenId,uint256 indexed _draftBidId,uint256 _year,bool _isFootball)"];
const DraftStakeClaimedAbi = ["event DraftStakeClaimed(uint256  _bidId,uint256  _year,address  _claimingAddress,uint256 _amount,bool _isFootball)"];

export class DraftControllerPoller {
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
		this.pathName = isFootball ? "draftControllerFootball" : "draftControllerBasketball";
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
		await this._pollDraftTimeSet(currentBlock, provider, apiKey);
		await this._pollDraftBidIncreased(currentBlock, provider, apiKey);
		await this._pollDraftBidPlaced(currentBlock, provider, apiKey);
		await this._pollResultsFinal(currentBlock, provider, apiKey);
		await this._pollClaimingRequirementsSet(currentBlock, provider, apiKey);
		await this._pollDraftPickClaimed(currentBlock, provider, apiKey);
		await this._pollDraftStakeClaimed(currentBlock, provider, apiKey);

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
			console.log("DraftControllerPoller: ", this.contractAddress)
			console.log("Is Football: ", this.isFootball)
			if (!rpcUrl) {
				throw new Error("No rpc url found");
			}
			return new ethers.providers.JsonRpcProvider(rpcUrl);
		} catch (error) {
			console.log('Error ', error);
			return;
		}
	}

	async _pollDraftTimeSet(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, DraftTimeSetAbi, provider);
		const contractFilter = this.contract.filters.DraftTimeSet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveDraftTimeSetEvent(log, provider, apiKey);
		}
	}
	async _pollDraftBidIncreased(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, DraftBidIncreasedAbi, provider);
		const contractFilter = this.contract.filters.DraftBidIncreased();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveDraftBidIncreasedEvent(log, provider, apiKey);
		}
	}
	async _pollDraftBidPlaced(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, DraftBidPlacedAbi, provider);
		const contractFilter = this.contract.filters.DraftBidPlaced();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveDraftBidPlacedEvent(log, provider, apiKey);
		}
	}
	async _pollResultsFinal(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, ResultsFinalAbi, provider);
		const contractFilter = this.contract.filters.DraftResultsFinalized();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveResultsFinalEvent(log, apiKey);
		}
	}
	async _pollClaimingRequirementsSet(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, ClaimingRequirementsSetAbi, provider);
		const contractFilter = this.contract.filters.ClaimingRequirementsSet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveClaimingRequirementsSetEvent(log, apiKey);
		}
	}
	async _pollDraftPickClaimed(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, DraftPickClaimedAbi, provider);
		const contractFilter = this.contract.filters.DraftPickClaimed();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveDraftPickClaimedEvent(log, apiKey);
		}
	}
	async _pollDraftStakeClaimed(currentBlock: number, provider: ethers.providers.JsonRpcProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, DraftStakeClaimedAbi, provider);
		const contractFilter = this.contract.filters.DraftStakeClaimed();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveDraftStakeClaimedEvent(log, apiKey);
		}
	}

	async _saveDraftTimeSetEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		console.log('Save Draft Time Set Event');
		const event = new DraftTimeSet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftTimeSet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for draftTimeSetEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);

	}
	async _saveDraftBidIncreasedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider, apiKey: string): Promise<unknown> {
		console.log('Save Draft Bid Increased Event');
		const draftBidIncreasedEvent = new DraftBidIncreased(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftBidIncreased", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for draftBidIncreasedEvent");
		}
		return await draftBidIncreasedEvent.saveData(endpoint, apiKey, provider);

	}
	async _saveDraftBidPlacedEvent(log: ethers.Event, provider: any, apiKey: string): Promise<unknown> {
		console.log('Save Draft Bid Placed Event');
		const draftBidPlacedEvent = new DraftBidPlaced(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftBidPlaced", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for draftBidPlacedEvent");
		}
		return await draftBidPlacedEvent.saveData(endpoint, apiKey, provider);

	}
	async _saveResultsFinalEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		console.log('Save Draft Results Finalized Event');
		const resultsFinalEvent = new DraftResultsFinalized(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftResultsFinalized", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveResultsFinalEvent");
		}
		return await resultsFinalEvent.saveData(endpoint, apiKey);

	}
	async _saveClaimingRequirementsSetEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		console.log('Save Claiming Requirements Set Event');
		const claimingRequirementsSetEvent = new ClaimingRequirementsSet(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "claimingRequirementsSet", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveClaimingRequirementsSetEvent");
		}
		return await claimingRequirementsSetEvent.saveData(endpoint, apiKey);

	}
	async _saveDraftPickClaimedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		console.log('Save Draft Pick Claimed Event');
		const draftPickClaimedEvent = new DraftPickClaimed(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftPickClaimed", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveDraftPickClaimedEvent");
		}
		return await draftPickClaimedEvent.saveData(endpoint, apiKey);
	}
	async _saveDraftStakeClaimedEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		console.log('Save Draft Stake Claimed Event');
		const draftStakeClaimedEvent = new DraftStakeClaimed(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "draftStakeClaimed", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveDraftStakeClaimedEvent");
		}
		return await draftStakeClaimedEvent.saveData(endpoint, apiKey);
	}
}

export class DraftControllerPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, isFootball: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<DraftControllerPoller> {
		const pollerInstance = new DraftControllerPoller(eventsDirectory, chainId, isFootball, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
