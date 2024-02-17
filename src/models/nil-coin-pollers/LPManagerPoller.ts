import { AccessCreditsAddressSet, AthletePriceSet, ClaimingRequirementsSet, CollectibleFaucetSale, CollectibleFaucetTimeSet, DraftBidIncreased, DraftBidPlaced, DraftPickClaimed, DraftResultsFinalized, DraftStakeClaimed, DraftTimeSet, FaucetLevelAdded, NilAddLiquidityProcedure, TokenUriSet } from "@kings-of-rings/kor-contract-event-data-models/lib";

import { ethers } from "ethers";
import * as admin from "firebase-admin";
import { getEndpoint } from "../../utils/getEndpoint";
const EVENTS_ABI = [
	"event NilAddLiquidityProcedure(uint256 _id, uint256 _stableLpAmount, uint256 _nilAmountBurned)"
];
export class LPManagerPoller {
	contractAddress: string = "";
	chainId: number;
	lastBlockPolled: number = 0;
	eventsDirectory: string;
	docName: string = "lpManager";
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
			await this._pollNilAddLiquidityProcedure(currentBlock, provider, apiKey);

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

	async _pollNilAddLiquidityProcedure(currentBlock: number, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string) {
		const contractFilter = this.contract.filters.NilAddLiquidityProcedure();
		const logs = await this.contract.queryFilter(contractFilter, this.lastBlockPolled, currentBlock);
		for (const log of logs) {
			await this._saveNilAddLiquidityProcedureEvent(log, provider, apiKey);
		}
	}

	async _saveNilAddLiquidityProcedureEvent(log: ethers.Event, provider: ethers.providers.JsonRpcProvider | ethers.providers.WebSocketProvider, apiKey: string): Promise<unknown> {
		const event = new NilAddLiquidityProcedure(log, this.chainId);
		const endpoint = await getEndpoint(this.eventsDirectory, "nilLiquidityProcedure", this.db);
		if (!endpoint) {
			throw new Error("No endpoint found for nilLiquidityProcedure");
		}
		return await event.saveData(endpoint, apiKey, provider);

	}

}

export class LPManagerPollerFactory {
	static async runPoller(eventsDirectory: string, chainId: number, db: admin.firestore.Firestore, apiKey: string): Promise<LPManagerPoller> {
		const pollerInstance = new LPManagerPoller(eventsDirectory, chainId, db);
		await pollerInstance.pollBlocks(apiKey);
		return pollerInstance;
	}
}
