import { TeamStakeAdded, TeamStakeClaimed, TeamStakingTimeSet } from "@kings-of-rings/kor-contract-event-data-models/lib";
import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const EVENTS_ABI = [
	"event StakeAdded(uint256 indexed _stakeId,address indexed _staker,uint256 indexed _collegeId,uint256 _amount,uint16 _year,bool _isNatty,bool _increase)",
	"event StakeClaimed(uint256 indexed _stakeId,address indexed _staker,uint256 indexed _collegeId,uint256 _amount,uint16 _year,bool _isNatty)",
	"event StakingTimeSet(uint256 _stakingOpens,uint256 _stakingCloses,uint256 _claimableTs,uint16 _year,bool _isNatty)"
];

export class TeamStakePollers {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	eventsDirectory: string;
	pathName: string;
	contract?: ethers.Contract;
	db: admin.firestore.Firestore;

	maxBlocksQuery = 1000;
	constructor(eventsDirectory: string, chainId: number, isNatty: boolean, isCurrentYear: boolean, db: admin.firestore.Firestore) {
		this.chainId = chainId;
		this.eventsDirectory = eventsDirectory;
		const prefix = isNatty ? "natty" : "team";
		const suffix = isCurrentYear ? "Current" : "Previous";
		this.pathName = `${prefix}Staking${suffix}`;
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
		await this._pollStakeAdded(currentBlock, provider, apiKey);
		await this._pollStakeClaimed(currentBlock, provider, apiKey);
		await this._pollStakingTimeSet(currentBlock, provider, apiKey);

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

	async _pollStakeAdded(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		const contractFilter = this.contract.filters.StakeAdded();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveStakeAddedEvent(log, provider, apiKey);
		}
	}
	async _pollStakeClaimed(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		const contractFilter = this.contract.filters.StakeClaimed();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveStakeClaimedEvent(log, provider, apiKey);
		}
	}
	async _pollStakingTimeSet(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);
		const contractFilter = this.contract.filters.StakingTimeSet();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveStakingTimeSetEvent(log, apiKey);
		}
	}


	async _saveStakeAddedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const draftBidIncreasedEvent = new TeamStakeAdded(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "teamStakeAdded", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for SaveStakeAddedEvent");
		}
		return await draftBidIncreasedEvent.saveData(endpoint, apiKey, provider);

	}
	async _saveStakeClaimedEvent(log: ethers.Event, provider: any, apiKey: string): Promise<unknown> {
		const draftBidPlacedEvent = new TeamStakeClaimed(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "teamStakeClaimed", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for SaveStakeClaimedEvent");
		}
		return await draftBidPlacedEvent.saveData(endpoint, apiKey);

	}
	async _saveStakingTimeSetEvent(log: ethers.Event, apiKey: string): Promise<unknown> {
		console.log('SaveStakingTimeSetEvent')
		const resultsFinalEvent = new TeamStakingTimeSet(log, this.chainId);
		console.log('resultsFinalEvent ', resultsFinalEvent)
		const endpoint = await getEndpoint(this.eventsDirectory, "teamStakeTimeSet", this.db);
		console.log('endpoint', endpoint)
		if (!endpoint) {
			throw new Error("No endpoint found for StakingTimeSetEvent");
		}
		return await resultsFinalEvent.saveData(endpoint, apiKey);
	}

}

export class TeamStakePollersFactory {
	static async runPoller(eventsDirectory: string, chainId: number, isNatty: boolean, isCurrentYear: boolean, db: admin.firestore.Firestore, apiKey: string): Promise<TeamStakePollers> {
		const pollerInstance = new TeamStakePollers(eventsDirectory, chainId, isNatty, isCurrentYear, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
