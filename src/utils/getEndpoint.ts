
import * as admin from "firebase-admin";

export const getEndpoint = async (eventsDirectory: string, fieldName: string, db: admin.firestore.Firestore): Promise<string> => {
	const ref = db.collection(eventsDirectory).doc("endpoints");
	const doc = await ref.get();
	const data = doc.data();
	if (data && data[fieldName]) {
		return data[fieldName];
	}
	return "";
}