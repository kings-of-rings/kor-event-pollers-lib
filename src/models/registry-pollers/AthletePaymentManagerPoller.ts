import { AthletePaymentDisbursed, AthletePaymentReceived, ClaimingRequirementsSet, DraftBidIncreased, DraftBidPlaced, DraftPickClaimed, DraftResultsFinalized, DraftStakeClaimed, DraftTimeSet, ProTeamAdded, ProTeamChanged } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";

const EVENTS_ABI = [
	"event PaymentReceived(uint256 indexed _paymentId,uint256 indexed _athleteId,address indexed _paymentToken,uint256 _amount,uint256 _balance)",
	"event PaymentDisbursed(uint256 indexed _disbursementId,uint256 indexed _athleteId,address indexed _paymentToken,address _disbursementAddress,uint256 _amount)",
];

export class AthletePaymentManagerPoller {
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
		this.pathName = "athletePaymentManager";
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
		this.contract = new ethers.Contract(this.contractAddress, EVENTS_ABI, provider);

		await this._pollPaymentReceived(currentBlock, provider, apiKey);
		await this._pollPaymentDisbursed(currentBlock, provider, apiKey);

		this.lastBlockPolled = currentBlock;	  // update contract last block polled
		const contractDoc = this.db.collection(`${this.eventsDirectory}/pollers/contracts`).doc(this.pathName);
		await contractDoc.update({
			lastBlockPolled: currentBlock - 1,
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

	async _pollPaymentReceived(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		const contractFilter = this.contract.filters.PaymentReceived();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._savePaymentReceivedEvent(log, provider, apiKey);
		}
	}
	async _pollPaymentDisbursed(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		const contractFilter = this.contract.filters.PaymentDisbursed();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._savePaymentDisbursedEvent(log, provider, apiKey);
		}
	}
	async _savePaymentReceivedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new AthletePaymentReceived(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athletePaymentReceived", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveTeamAddedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	}

	async _savePaymentDisbursedEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new AthletePaymentDisbursed(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "athletePaymentDisbursed", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for saveTeamChangedEvent");
		}
		return await event.saveData(endpoint, apiKey, provider);
	}
}

export class AthletePaymentManagerPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore, apiKey: string): Promise<AthletePaymentManagerPoller> {
		const pollerInstance = new AthletePaymentManagerPoller(eventsDirectory, chainId, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
