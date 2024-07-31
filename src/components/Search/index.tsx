import {useNavigation} from '@react-navigation/native';
import type {StackNavigationProp} from '@react-navigation/stack';
import React, {useCallback, useEffect, useRef} from 'react';
import type {OnyxEntry} from 'react-native-onyx';
import {useOnyx} from 'react-native-onyx';
import SearchTableHeader from '@components/SelectionList/SearchTableHeader';
import type {ReportListItemType, TransactionListItemType} from '@components/SelectionList/types';
import SearchRowSkeleton from '@components/Skeletons/SearchRowSkeleton';
import useNetwork from '@hooks/useNetwork';
import useThemeStyles from '@hooks/useThemeStyles';
import useWindowDimensions from '@hooks/useWindowDimensions';
import * as SearchActions from '@libs/actions/Search';
import * as DeviceCapabilities from '@libs/DeviceCapabilities';
import Log from '@libs/Log';
import memoize from '@libs/memoize';
import * as ReportUtils from '@libs/ReportUtils';
import * as SearchUtils from '@libs/SearchUtils';
import Navigation from '@navigation/Navigation';
import type {AuthScreensParamList} from '@navigation/types';
import EmptySearchView from '@pages/Search/EmptySearchView';
import variables from '@styles/variables';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type SearchResults from '@src/types/onyx/SearchResults';
import type {SearchDataTypes} from '@src/types/onyx/SearchResults';
import {useSearchContext} from './SearchContext';
import SearchListWithHeader from './SearchListWithHeader';
import SearchPageHeader from './SearchPageHeader';
import type {SearchColumnType, SearchQueryJSON, SortOrder} from './types';

type SearchProps = {
    queryJSON: SearchQueryJSON;
    isCustomQuery: boolean;
};

const transactionItemMobileHeight = 100;
const reportItemTransactionHeight = 52;
const listItemPadding = 12; // this is equivalent to 'mb3' on every transaction/report list item
const searchHeaderHeight = 54;

function Search({queryJSON, isCustomQuery}: SearchProps) {
    const {isOffline} = useNetwork();
    const styles = useThemeStyles();
    const {isLargeScreenWidth, isSmallScreenWidth} = useWindowDimensions();
    const navigation = useNavigation<StackNavigationProp<AuthScreensParamList>>();
    const lastSearchResultsRef = useRef<OnyxEntry<SearchResults>>();
    const {setCurrentSearchHash} = useSearchContext();
    const [selectionMode] = useOnyx(ONYXKEYS.MOBILE_SELECTION_MODE);
    const [offset, setOffset] = React.useState(0);

    const {sortBy, sortOrder, hash} = queryJSON;

    const [currentSearchResults] = useOnyx(`${ONYXKEYS.COLLECTION.SNAPSHOT}${hash}`);

    const getItemHeight = useCallback(
        (item: TransactionListItemType | ReportListItemType) => {
            if (SearchUtils.isTransactionListItemType(item)) {
                return isLargeScreenWidth ? variables.optionRowHeight + listItemPadding : transactionItemMobileHeight + listItemPadding;
            }

            if (item.transactions.length === 0) {
                return 0;
            }

            if (item.transactions.length === 1) {
                return isLargeScreenWidth ? variables.optionRowHeight + listItemPadding : transactionItemMobileHeight + listItemPadding;
            }

            const baseReportItemHeight = isLargeScreenWidth ? 72 : 108;
            return baseReportItemHeight + item.transactions.length * reportItemTransactionHeight + listItemPadding;
        },
        [isLargeScreenWidth],
    );

    const getItemHeightMemoized = memoize((item: TransactionListItemType | ReportListItemType) => getItemHeight(item), {
        transformKey: ([item]) => {
            // List items are displayed differently on "L"arge and "N"arrow screens so the height will differ
            // in addition the same items might be displayed as part of different Search screens ("Expenses", "All", "Finished")
            const screenSizeHash = isLargeScreenWidth ? 'L' : 'N';
            return `${hash}-${item.keyForList}-${screenSizeHash}`;
        },
    });

    // save last non-empty search results to avoid ugly flash of loading screen when hash changes and onyx returns empty data
    if (currentSearchResults?.data && currentSearchResults !== lastSearchResultsRef.current) {
        lastSearchResultsRef.current = currentSearchResults;
    }

    const searchResults = currentSearchResults?.data ? currentSearchResults : lastSearchResultsRef.current;

    useEffect(() => {
        if (isOffline) {
            return;
        }

        setCurrentSearchHash(hash);

        SearchActions.search({queryJSON, offset});
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
    }, [isOffline, offset, queryJSON]);

    const isDataLoaded = searchResults?.data !== undefined;
    const shouldShowLoadingState = !isOffline && !isDataLoaded;
    const shouldShowLoadingMoreItems = !shouldShowLoadingState && searchResults?.search?.isLoading && searchResults?.search?.offset > 0;

    if (shouldShowLoadingState) {
        return (
            <>
                <SearchPageHeader
                    isCustomQuery={isCustomQuery}
                    queryJSON={queryJSON}
                    hash={hash}
                />
                <SearchRowSkeleton shouldAnimate />
            </>
        );
    }

    const shouldShowEmptyState = !isDataLoaded || SearchUtils.isSearchResultsEmpty(searchResults);

    if (shouldShowEmptyState) {
        return (
            <>
                <SearchPageHeader
                    isCustomQuery={isCustomQuery}
                    queryJSON={queryJSON}
                    hash={hash}
                />
                <EmptySearchView />
            </>
        );
    }

    const openReport = (item: TransactionListItemType | ReportListItemType) => {
        let reportID = SearchUtils.isTransactionListItemType(item) ? item.transactionThreadReportID : item.reportID;

        if (!reportID) {
            return;
        }

        // If we're trying to open a legacy transaction without a transaction thread, let's create the thread and navigate the user
        if (SearchUtils.isTransactionListItemType(item) && reportID === '0' && item.moneyRequestReportActionID) {
            reportID = ReportUtils.generateReportID();
            SearchActions.createTransactionThread(hash, item.transactionID, reportID, item.moneyRequestReportActionID);
        }

        Navigation.navigate(ROUTES.SEARCH_REPORT.getRoute(reportID));
    };

    const fetchMoreResults = () => {
        if (!searchResults?.search?.hasMoreResults || shouldShowLoadingState || shouldShowLoadingMoreItems) {
            return;
        }
        setOffset(offset + CONST.SEARCH.RESULTS_PAGE_SIZE);
    };

    const type = SearchUtils.getSearchType(searchResults?.search);

    if (type === undefined) {
        Log.alert('[Search] Undefined search type');
        return null;
    }

    const ListItem = SearchUtils.getListItem(type);

    const data = SearchUtils.getSections(searchResults?.data ?? {}, searchResults?.search ?? {}, type);
    const sortedData = SearchUtils.getSortedSections(type, data, sortBy, sortOrder);

    const onSortPress = (column: SearchColumnType, order: SortOrder) => {
        const newQuery = SearchUtils.buildSearchQueryString({...queryJSON, sortBy: column, sortOrder: order});
        navigation.setParams({q: newQuery});
    };

    const shouldShowYear = SearchUtils.shouldShowYear(searchResults?.data);

    const canSelectMultiple = isSmallScreenWidth ? selectionMode?.isEnabled : true;

    return (
        <SearchListWithHeader
            queryJSON={queryJSON}
            hash={hash}
            data={sortedData}
            searchType={searchResults?.search?.type as SearchDataTypes}
            isCustomQuery={isCustomQuery}
            customListHeader={
                !isLargeScreenWidth ? null : (
                    <SearchTableHeader
                        data={searchResults?.data}
                        metadata={searchResults?.search}
                        onSortPress={onSortPress}
                        sortOrder={sortOrder}
                        sortBy={sortBy}
                        shouldShowYear={shouldShowYear}
                    />
                )
            }
            canSelectMultiple={canSelectMultiple}
            customListHeaderHeight={searchHeaderHeight}
            // To enhance the smoothness of scrolling and minimize the risk of encountering blank spaces during scrolling,
            // we have configured a larger windowSize and a longer delay between batch renders.
            // The windowSize determines the number of items rendered before and after the currently visible items.
            // A larger windowSize helps pre-render more items, reducing the likelihood of blank spaces appearing.
            // The updateCellsBatchingPeriod sets the delay (in milliseconds) between rendering batches of cells.
            // A longer delay allows the UI to handle rendering in smaller increments, which can improve performance and smoothness.
            // For more information, refer to the React Native documentation:
            // https://reactnative.dev/docs/0.73/optimizing-flatlist-configuration#windowsize
            // https://reactnative.dev/docs/0.73/optimizing-flatlist-configuration#updatecellsbatchingperiod
            windowSize={111}
            updateCellsBatchingPeriod={200}
            ListItem={ListItem}
            onSelectRow={openReport}
            getItemHeight={getItemHeightMemoized}
            shouldDebounceRowSelect
            shouldPreventDefaultFocusOnSelectRow={!DeviceCapabilities.canUseTouchScreen()}
            listHeaderWrapperStyle={[styles.ph8, styles.pv3, styles.pb5]}
            containerStyle={[styles.pv0]}
            showScrollIndicator={false}
            onEndReachedThreshold={0.75}
            onEndReached={fetchMoreResults}
            listFooterContent={
                shouldShowLoadingMoreItems ? (
                    <SearchRowSkeleton
                        shouldAnimate
                        fixedNumItems={5}
                    />
                ) : undefined
            }
        />
    );
}

Search.displayName = 'Search';

export type {SearchProps};
export default Search;
