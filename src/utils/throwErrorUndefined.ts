

export const throwErrorIfUndefined = (itemToCheck: any, errorMessage: string): unknown => {
	if (itemToCheck === undefined) {
		throw new Error(errorMessage);
	}
	return itemToCheck;
}