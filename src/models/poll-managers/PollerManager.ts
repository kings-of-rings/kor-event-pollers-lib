import * as admin from "firebase-admin";
import { DynamicFunctionSelectorFactory } from "./DynamicFunctionSelector";
type PollContractData = {
	contractName: string;
	contractAddress: string;
	lastBlockPolled: number;
	maxBlocksQuery: number;
	paused: boolean;
	rpcUrl: string;
}

export class PollerManager {
	chainId: number = 0;
	pollDelay: number = 10000;
	contractsPerPoll: number = 5;
	eventsDirectory: string;
	contractsToPoll: PollContractData[] = [];
	db: admin.firestore.Firestore;
	constructor(eventsDirectory: string, db: admin.firestore.Firestore) {
		this.eventsDirectory = eventsDirectory;
		this.db = db;
		this.pollContinuously = this.pollContinuously.bind(this);

	};

	async _loadSettings() {
		const settingsDoc = await this.db.collection(this.eventsDirectory).doc("pollers").get();
		const data: Record<string, any> | undefined = settingsDoc.data();
		if (data) {
			this.chainId = data.chainId;
			this.contractsPerPoll = data.contractsPerPoll;
		}
		return;
	}

	//Use this Method if the Poll Manager will only poll for new contracts once
	async pollOnce() {
		await this._loadSettings();
		await this._checkContracts();
	}

	//Use this Method if the Poll Manager will remain active and poll for new contracts
	pollContinuously() {
		console.log("Polling Continuously");
		this.db.collection(this.eventsDirectory).doc("pollers")
			.onSnapshot((doc) => {
				const data: Record<string, any> | undefined = doc.data();
				if (data) {
					this.chainId = data.chainId;
					this.contractsPerPoll = data.contractsPerPoll;
					this.pollDelay = data.pollDelay;
				}
			});
		this._startPoller();
	}

	async _startPoller() {
		setInterval(async () => {
			await this._checkContracts();
		}, this.pollDelay);
	}

	async _checkContracts() {
		const contractsToPoll = await this._getContractsToPoll();
		for (const contract of contractsToPoll) {
			await this._pollContract(contract);
		}
	}

	async _getContractsToPoll(): Promise<PollContractData[]> {
		const listToReturn: PollContractData[] = [];
		const collectionRef = this.db.collection(`${this.eventsDirectory}/pollers/contracts`);
		const queryRef = collectionRef.orderBy("lastBlockPolled", "asc").where("paused", "==", false).limit(this.contractsPerPoll);
		const querySnapshot = await queryRef.get();
		querySnapshot.forEach((doc) => {
			const data = doc.data();
			const address = data.contractAddress;
			const lastBlockPolled = data.lastBlockPolled;
			const contractData: PollContractData = {
				contractAddress: address,
				lastBlockPolled: lastBlockPolled,
				maxBlocksQuery: data.maxBlocksQuery,
				paused: data.paused,
				rpcUrl: data.rpcUrl,
				contractName: doc.id
			};
			listToReturn.push(contractData);
		});
		return listToReturn;
	}

	async _pollContract(contract: PollContractData) {
		await DynamicFunctionSelectorFactory.pollContract(contract, this.eventsDirectory, this.chainId, this.db);
	}
}

export class PollerManagerFactory {
	static async pollOnce(eventsPath: string, db: admin.firestore.Firestore): Promise<PollerManager> {
		const itemToReturn = new PollerManager(eventsPath, db);
		await itemToReturn.pollOnce();
		return itemToReturn;
	}
	static async pollContinuously(eventsPath: string, db: admin.firestore.Firestore): Promise<PollerManager> {
		const itemToReturn = new PollerManager(eventsPath, db);
		itemToReturn.pollContinuously();
		return itemToReturn;
	}
}
