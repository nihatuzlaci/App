import type {OnyxCollection, OnyxEntry} from 'react-native-onyx';
import Onyx from 'react-native-onyx';
import type {LocaleContextProps} from '@components/LocaleContextProvider';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type {Unit} from '@src/types/onyx/Policy';
import type Policy from '@src/types/onyx/Policy';
import * as CurrencyUtils from './CurrencyUtils';
import * as PolicyUtils from './PolicyUtils';

type DefaultMileageRate = {
    rate?: number;
    currency?: string;
    unit: Unit;
    name?: string;
    customUnitRateID?: string;
};

const policies: OnyxCollection<Policy> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.POLICY,
    callback: (policy, key) => {
        if (!policy || !key || !policy.name) {
            return;
        }

        policies[key] = policy;
    },
});

/**
 * Retrieves the default mileage rate based on a given policy.
 *
 * @param policy - The policy from which to extract the default mileage rate.
 *
 * @returns An object containing the rate and unit for the default mileage or null if not found.
 * @returns [rate] - The default rate for the mileage.
 * @returns [currency] - The currency associated with the rate.
 * @returns [unit] - The unit of measurement for the distance.
 */
function getDefaultMileageRate(policy: OnyxEntry<Policy>): DefaultMileageRate | null {
    if (!policy?.customUnits) {
        return null;
    }

    const distanceUnit = Object.values(policy.customUnits).find((unit) => unit.name === CONST.CUSTOM_UNITS.NAME_DISTANCE);
    if (!distanceUnit?.rates) {
        return null;
    }

    const distanceRate = Object.values(distanceUnit.rates).find((rate) => rate.name === CONST.CUSTOM_UNITS.DEFAULT_RATE);
    if (!distanceRate) {
        return null;
    }

    return {
        rate: distanceRate.rate,
        currency: distanceRate.currency,
        unit: distanceUnit.attributes.unit,
        name: distanceRate.name,
        customUnitRateID: distanceRate.customUnitRateID,
    };
}

/**
 * Converts a given distance in meters to the specified unit (kilometers or miles).
 *
 * @param distanceInMeters - The distance in meters to be converted.
 * @param unit - The desired unit of conversion, either 'km' for kilometers or 'mi' for miles.
 *
 * @returns The converted distance in the specified unit.
 */
function convertDistanceUnit(distanceInMeters: number, unit: Unit): number {
    const METERS_TO_KM = 0.001; // 1 kilometer is 1000 meters
    const METERS_TO_MILES = 0.000621371; // There are approximately 0.000621371 miles in a meter

    switch (unit) {
        case CONST.CUSTOM_UNITS.DISTANCE_UNIT_KILOMETERS:
            return distanceInMeters * METERS_TO_KM;
        case CONST.CUSTOM_UNITS.DISTANCE_UNIT_MILES:
            return distanceInMeters * METERS_TO_MILES;
        default:
            throw new Error('Unsupported unit. Supported units are "mi" or "km".');
    }
}

/**
 * @param distanceInMeters Distance traveled
 * @param unit Unit that should be used to display the distance
 * @returns The distance in requested units, rounded to 2 decimals
 */
function getRoundedDistanceInUnits(distanceInMeters: number, unit: Unit): string {
    const convertedDistance = convertDistanceUnit(distanceInMeters, unit);
    // TODO: add logic for currencies for which we need to round to 4 decimals
    return convertedDistance.toFixed(3);
}

// TODO: I wonder if it would be better to refactor these functions to pass params in an object
/**
 * @param hasRoute Whether the route exists for the distance request
 * @param unit Unit that should be used to display the distance
 * @param rate Expensable amount allowed per unit
 * @param currency The currency associated with the rate
 * @param translate Translate function
 * @param toLocaleDigit Function to convert to localized digit
 * @returns A string that describes the distance traveled and the rate used for expense calculation
 */
function getRateForDisplay(
    hasRoute: boolean,
    unit: Unit,
    rate: number,
    currency: string,
    translate: LocaleContextProps['translate'],
    toLocaleDigit: LocaleContextProps['toLocaleDigit'],
): string {
    if (!hasRoute || !rate) {
        return translate('iou.routePending');
    }

    const singularDistanceUnit = unit === CONST.CUSTOM_UNITS.DISTANCE_UNIT_MILES ? translate('common.mile') : translate('common.kilometer');
    const ratePerUnit = PolicyUtils.getUnitRateValue({rate}, toLocaleDigit);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const currencySymbol = CurrencyUtils.getCurrencySymbol(currency) || `${currency} `;

    return `${currencySymbol}${ratePerUnit} / ${singularDistanceUnit}`;
}

// TODO: this function will be added in https://github.com/Expensify/App/pull/37185, remove it to avoid conflicts
/**
 * @param hasRoute Whether the route exists for the distance request
 * @param distanceInMeters Distance traveled
 * @param unit Unit that should be used to display the distance
 * @param rate Expensable amount allowed per unit
 * @param translate Translate function
 * @returns A string that describes the distance traveled
 */
function getDistanceForDisplay(hasRoute: boolean, distanceInMeters: number, unit: Unit, rate: number, translate: LocaleContextProps['translate']): string {
    if (!hasRoute || !rate) {
        return translate('iou.routePending');
    }

    const distanceInUnits = getRoundedDistanceInUnits(distanceInMeters, unit);
    const distanceUnit = unit === CONST.CUSTOM_UNITS.DISTANCE_UNIT_MILES ? translate('common.miles') : translate('common.kilometers');
    const singularDistanceUnit = unit === CONST.CUSTOM_UNITS.DISTANCE_UNIT_MILES ? translate('common.mile') : translate('common.kilometer');
    const unitString = distanceInUnits === '1' ? singularDistanceUnit : distanceUnit;

    return `${distanceInUnits} ${unitString}`;
}

/**
 * @param hasRoute Whether the route exists for the distance request
 * @param distanceInMeters Distance traveled
 * @param unit Unit that should be used to display the distance
 * @param rate Expensable amount allowed per unit
 * @param currency The currency associated with the rate
 * @param translate Translate function
 * @param toLocaleDigit Function to convert to localized digit
 * @returns A string that describes the distance traveled and the rate used for expense calculation
 */
function getDistanceMerchant(
    hasRoute: boolean,
    distanceInMeters: number,
    unit: Unit,
    rate: number,
    currency: string,
    translate: LocaleContextProps['translate'],
    toLocaleDigit: LocaleContextProps['toLocaleDigit'],
): string {
    if (!hasRoute || !rate) {
        return translate('iou.routePending');
    }

    const distanceInUnits = getDistanceForDisplay(hasRoute, distanceInMeters, unit, rate, translate);
    const ratePerUnit = getRateForDisplay(hasRoute, unit, rate, currency, translate, toLocaleDigit);

    return `${distanceInUnits} @ ${ratePerUnit}`;
}

/**
 * Retrieves the mileage rates for given policy.
 *
 * @param policyID - The policy ID from which to extract the mileage rates.
 *
 * @returns An array of mileage rates or an empty array if not found.
 */
function getMileageRates(policyID?: string): Record<string, DefaultMileageRate> {
    const mileageRates = {};

    if (!policyID) {
        return mileageRates;
    }

    const policy = policies?.[`${ONYXKEYS.COLLECTION.POLICY}${policyID}`] ?? null;

    if (!policy || !policy?.customUnits) {
        return mileageRates;
    }

    const distanceUnit = Object.values(policy.customUnits).find((unit) => unit.name === CONST.CUSTOM_UNITS.NAME_DISTANCE);
    if (!distanceUnit?.rates) {
        return mileageRates;
    }

    Object.entries(distanceUnit.rates).forEach(([rateID, rate]) => {
        // TODO: fix TS error
        mileageRates[rateID] = {
            rate: rate.rate,
            currency: rate.currency,
            unit: distanceUnit.attributes.unit,
            name: rate.name,
            customUnitRateID: rate.customUnitRateID,
        };
    });

    return mileageRates;
}

// TODO: probably will need to be changed
function getRateForP2P(currency) {
    return CONST.CURRENCY_TO_DEFAULT_MILEAGE_RATE[currency] ?? CONST.CURRENCY_TO_DEFAULT_MILEAGE_RATE.USD;
}

/**
 * Calculates the request amount based on distance, unit, and rate.
 *
 * @param distance - The distance traveled in meters
 * @param unit - The unit of measurement for the distance
 * @param rate - Rate used for calculating the request amount
 * @returns The computed request amount (rounded) in "cents".
 */
function getDistanceRequestAmount(distance: number, unit: Unit, rate: number): number {
    const convertedDistance = convertDistanceUnit(distance, unit);
    const roundedDistance = parseFloat(convertedDistance.toFixed(2));
    return Math.round(roundedDistance * rate);
}

export default {
    getDefaultMileageRate,
    getDistanceMerchant,
    getDistanceRequestAmount,
    getRateForDisplay,
    getMileageRates,
    getDistanceForDisplay,
    getRateForP2P,
};
