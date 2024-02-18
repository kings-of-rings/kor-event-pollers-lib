import * as admin from "firebase-admin";
import { AthletePaymentManagerPollerFactory } from "../registry-pollers/AthletePaymentManagerPoller";
import { AthleteRegistryPollerFactory } from "../registry-pollers/AthleteRegistryPoller";
import { CollegeRegistryPollerFactory } from "../registry-pollers/CollegeRegistryPoller";
import { KoRDirectoryPollerFactory } from "../registry-pollers/KoRDirectoryPoller";
import { ProRegistryPollerFactory } from "../registry-pollers/ProRegistryPoller";
import { TeamStakePollersFactory } from "../staking-pollers/TeamStakePollers";
import { CollectibleBurnAuctionPollerFactory } from "../collectible-series/CollectibleBurnAuctionPoller";
import { CollectibleFaucetPollerFactory } from "../collectible-series/CollectibleFaucetPoller";
import { CollectibleNftsPollerFactory } from "../collectible-series/CollectibleNftsPoller";
import { RingSeriesManagerPollerFactory } from "../ring-series/RingSeriesManagerPoller";
import { ProRingSeriesNftsPollerFactory } from "../ring-series/ProRingSeriesNftsPoller";
import { DraftPickNftsPollerFactory } from "../draft-pollers/DraftPickNftsPoller";
import { CollegeRingSeriesNftsPollerFactory } from "../ring-series/CollegeRingSeriesNftsPoller";

import { LPManagerPollerFactory } from "../nil-coin-pollers/LPManagerPoller";
import { NILCoinFaucetPollerFactory } from "../nil-coin-pollers/NILCoinFaucetPoller";
import { DraftControllerPollerFactory } from "../draft-pollers/DraftControllerPoller";

type PollContractData = {
	contractName: string;
	contractAddress: string;
	lastBlockPolled: number;
	maxBlocksQuery: number;
	paused: boolean;
	rpcUrl: string;
}
export class DynamicFunctionSelector {
	chainId: number;
	apiKey: string;
	eventsDirectory: string;
	contractToPoll?: PollContractData;
	db: admin.firestore.Firestore;
	// Correctly type functionMap to store references to functions that, when called, return a Promise<void>
	functionMap: Record<string, () => Promise<void>>;

	constructor(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore) {
		this.eventsDirectory = eventsDirectory;
		this.db = db;
		this.chainId = chainId;
		if (!process.env.LAMBDA_API_KEY) {
			throw new Error("API Key not found");
		}
		this.apiKey = process.env.LAMBDA_API_KEY;
		this.functionMap = {
			//Registry Functions
			athleteRegistry: this.athleteRegistry.bind(this),
			collegeRegistry: this.collegeRegistry.bind(this),
			korDirectory: this.korDirectory.bind(this),
			proTeamsRegistry: this.proTeamsRegistry.bind(this),
			athletePaymentManager: this.athletePaymentManager.bind(this),
			//Staking Functions
			teamStakingCurrent: this.teamStakingCurrent.bind(this),
			teamStakingPrevious: this.teamStakingPrevious.bind(this),
			nattyStakingCurrent: this.nattyStakingCurrent.bind(this),
			nattyStakingPrevious: this.nattyStakingPrevious.bind(this),
			//Collectible Series Functions
			collectibleSeriesFaucetFootball: this.collectibleSeriesFaucetFootball.bind(this),
			collectibleSeriesFaucetBasketball: this.collectibleSeriesFaucetBasketball.bind(this),
			collectibleSeriesNfts: this.collectibleSeriesNfts.bind(this),
			collegeBurnAuctionFootball: this.collegeBurnAuctionFootball.bind(this),
			collegeBurnAuctionBasketball: this.collegeBurnAuctionBasketball.bind(this),
			//Draft Functions
			draftControllerFootball: this.draftControllerFootball.bind(this),
			draftControllerBasketball: this.draftControllerBasketball.bind(this),
			draftPickNftsFootball: this.draftPickNftsFootball.bind(this),
			draftPickNftsBasketball: this.draftPickNftsBasketball.bind(this),
			//NIL Coin Functions
			lpManager: this.lpManager.bind(this),
			nilCoinFaucet: this.nilCoinFaucet.bind(this),
			//Ring Series Functions
			collegeRingSeriesNft: this.collegeRingSeriesNft.bind(this),
			proRingSeriesNft: this.proRingSeriesNft.bind(this),
			ringSeriesManager: this.ringSeriesManager.bind(this),
			//Revenue Manager
			// revenueManager: this.revenueManager.bind(this),
		};
	}

	async pollContract(contract: PollContractData) {
		const functionName = contract.contractName;
		const functionToExecute = this.functionMap[functionName];
		if (functionToExecute) {
			await functionToExecute();
		} else {
			console.log("No function found for:", functionName);
		}
	}

	//Registry Listeners
	//#region Registry Functions 
	async athleteRegistry() {
		await AthleteRegistryPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	async collegeRegistry() {
		await CollegeRegistryPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	async korDirectory() {
		await KoRDirectoryPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	async proTeamsRegistry() {
		await ProRegistryPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//#endregion

	//#region Athlete Payment Manager
	async athletePaymentManager() {
		await AthletePaymentManagerPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//#endregion

	//#region Staking Pollers
	async teamStakingCurrent() {
		await TeamStakePollersFactory.runPoller(this.eventsDirectory, this.chainId, false, true, this.db, this.apiKey);
	}
	async teamStakingPrevious() {
		await TeamStakePollersFactory.runPoller(this.eventsDirectory, this.chainId, false, false, this.db, this.apiKey);
	}
	async nattyStakingCurrent() {
		await TeamStakePollersFactory.runPoller(this.eventsDirectory, this.chainId, true, true, this.db, this.apiKey);
	}
	async nattyStakingPrevious() {
		await TeamStakePollersFactory.runPoller(this.eventsDirectory, this.chainId, true, false, this.db, this.apiKey);
	}
	//#endregion

	//#region Collectible Series Functions
	//collectibleSeriesFaucetFootball
	async collectibleSeriesFaucetFootball() {
		await CollectibleFaucetPollerFactory.runPoller(this.eventsDirectory, this.chainId, true, this.db, this.apiKey);
	}
	//collectibleSeriesFaucetBasketball
	async collectibleSeriesFaucetBasketball() {
		await CollectibleFaucetPollerFactory.runPoller(this.eventsDirectory, this.chainId, false, this.db, this.apiKey);
	}
	//collectibleSeriesNfts
	async collectibleSeriesNfts() {
		await CollectibleNftsPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//collegeBurnAuctionFootball
	async collegeBurnAuctionFootball() {
		await CollectibleBurnAuctionPollerFactory.runPoller(this.eventsDirectory, this.chainId, true, this.db, this.apiKey);
	}
	//collegeBurnAuctionBasketball
	async collegeBurnAuctionBasketball() {
		await CollectibleBurnAuctionPollerFactory.runPoller(this.eventsDirectory, this.chainId, false, this.db, this.apiKey);
	}
	//#endregion


	//#region Draft Functions Functions
	//draftControllerFootball
	async draftControllerFootball() {
		await DraftControllerPollerFactory.runPoller(this.eventsDirectory, this.chainId, true, this.db, this.apiKey);
	}
	//draftControllerBasketball
	async draftControllerBasketball() {
		await DraftControllerPollerFactory.runPoller(this.eventsDirectory, this.chainId, false, this.db, this.apiKey);
	}
	//draftPickNftsFootball
	async draftPickNftsFootball() {
		await DraftPickNftsPollerFactory.runPoller(this.eventsDirectory, this.chainId, true, this.db, this.apiKey);
	}
	//draftPickNftsBasketball
	async draftPickNftsBasketball() {
		await DraftPickNftsPollerFactory.runPoller(this.eventsDirectory, this.chainId, false, this.db, this.apiKey);
	}
	//#endregion


	//#region NIL Coin Functions
	//lpManager
	async lpManager() {
		await LPManagerPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//nilCoinFaucet
	async nilCoinFaucet() {
		await NILCoinFaucetPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//#endregion

	//#region Ring Series Functions
	//collegeRingSeriesNft
	async collegeRingSeriesNft() {
		await CollegeRingSeriesNftsPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//proRingSeriesNft
	async proRingSeriesNft() {
		await ProRingSeriesNftsPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//ringSeriesManager
	async ringSeriesManager() {
		await RingSeriesManagerPollerFactory.runPoller(this.eventsDirectory, this.chainId, this.db, this.apiKey);
	}
	//#endregion

}



export class DynamicFunctionSelectorFactory {
	static async pollContract(contract: PollContractData, eventsDirectory: string, chainId: number, db: admin.firestore.Firestore): Promise<DynamicFunctionSelector> {
		const itemToReturn = new DynamicFunctionSelector(eventsDirectory, chainId, db);
		await itemToReturn.pollContract(contract);
		return itemToReturn;
	}
}
