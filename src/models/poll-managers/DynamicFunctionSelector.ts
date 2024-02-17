import * as admin from "firebase-admin";
import { AthletePaymentManagerPollerFactory } from "../registry-pollers/AthletePaymentManagerPoller";
import { AthleteRegistryPollerFactory } from "../registry-pollers/AthleteRegistryPoller";
import { CollegeRegistryPollerFactory } from "../registry-pollers/CollegeRegistryPoller";
import { KoRDirectoryPollerFactory } from "../registry-pollers/KoRDirectoryPoller";
import { ProRegistryPollerFactory } from "../registry-pollers/ProRegistryPoller";
import { TeamStakePollersFactory } from "../staking-pollers/TeamStakePollers";

export class DynamicFunctionSelector {
	chainId: number;
	apiKey: string;
	eventsDirectory: string;
	contractToPoll: PollContractData;
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
			proRegistry: this.proRegistry.bind(this),
			athletePaymentManager: this.athletePaymentManager.bind(this),
			//Staking Functions
			teamStakingCurrent: this.teamStakingCurrent.bind(this),
			teamStakingPrevious: this.teamStakingPrevious.bind(this),
			nattyStakingCurrent: this.nattyStakingCurrent.bind(this),
			nattyStakingPrevious: this.nattyStakingPrevious.bind(this),
			//Collectible Series Functions
			//nftCollectibleSeriesFunction
			//collectible Faucet Function
			//burn Auction Function

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
	async proRegistry() {
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
	//nftCollectibleSeriesFunction
	


	//#endregion



}



export class DynamicFunctionSelectorFactory {
	static async pollContract(contract: PollContractData, eventsDirectory: string, chainId: number, db: admin.firestore.Firestore): Promise<DynamicFunctionSelector> {
		const itemToReturn = new DynamicFunctionSelector(eventsDirectory, chainId, db);
		await itemToReturn.pollContract(contract);
		return itemToReturn;
	}
}
