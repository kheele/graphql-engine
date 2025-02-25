import { useQuery } from 'react-query';
import { useHttpClient } from '@/features/Network';
import {
  DataSource,
  Feature,
  exportMetadata,
  Table,
} from '@/features/DataSource';
import type { IntrospectedTable, MetadataTable } from '@/features/DataSource';

import type { TrackableTable } from '../types';

export type UseTablesProps = {
  dataSourceName: string;
};

const getTableName = (table: Table, databaseHierarcy: string[]): string => {
  if (databaseHierarcy.length === 0) {
    if (!Array.isArray(table)) return '';

    const result = table.reduce<string[]>((acc, item) => {
      if (typeof item === 'string') acc.push(item);
      return acc;
    }, []);

    return result.join('.');
  }

  if (table && typeof table === 'object') {
    const flatJsonTableDefinition = Object.entries(table).reduce<
      Record<string, string>
    >((acc, item) => {
      const [key, value] = item;
      if (typeof key === 'string' && typeof value === 'string')
        acc[key] = value;
      return acc;
    }, {});

    const tableName = databaseHierarcy
      .map(key => {
        return flatJsonTableDefinition[key];
      })
      .join('.');
    return tableName;
  }

  return JSON.stringify(table);
};

const getTrackableTables = (
  trackedTables: MetadataTable[],
  introspectedTables: IntrospectedTable[],
  databaseHierarcy: string[]
) =>
  introspectedTables.map(introspectedTable => {
    const trackedTable = trackedTables.find(
      _trackedTable =>
        getTableName(_trackedTable.table, databaseHierarcy) ===
        introspectedTable.name
    );

    const isTracked = !!trackedTable;
    if (isTracked) {
      const trackableTable: TrackableTable = {
        id: introspectedTable.name,
        name: introspectedTable.name,
        table: introspectedTable.table,
        type: introspectedTable.type,
        is_tracked: isTracked,
        configuration: {
          custom_root_fields: trackedTable?.configuration?.custom_root_fields,
        },
      };
      return trackableTable;
    }

    const trackableTable: TrackableTable = {
      id: introspectedTable.name,
      name: introspectedTable.name,
      table: introspectedTable.table,
      type: introspectedTable.type,
      is_tracked: isTracked,
    };
    return trackableTable;
  });

export const useTables = ({ dataSourceName }: UseTablesProps) => {
  const httpClient = useHttpClient();
  return useQuery<TrackableTable[], Error>({
    queryKey: [dataSourceName, 'tables'],
    queryFn: async () => {
      const { metadata } = await exportMetadata({ httpClient });
      const currentMetadataSource = metadata.sources?.find(
        source => source.name === dataSourceName
      );
      if (!currentMetadataSource)
        throw Error(`useTables.metadataSource not found`);

      const introspectedTables = await DataSource(httpClient).introspectTables({
        dataSourceName,
      });

      if (introspectedTables === Feature.NotImplemented)
        throw Error(
          `useTables.introspectedTables Feature is not available for ${currentMetadataSource.kind}`
        );

      const trackedTables = currentMetadataSource.tables;
      const databaseHierarcy = await DataSource(
        httpClient
      ).getDatabaseHierarchy({ dataSourceName });

      const trackableTables = getTrackableTables(
        trackedTables,
        introspectedTables,
        databaseHierarcy
      );
      return trackableTables;
    },
    refetchOnWindowFocus: false,
  });
};
