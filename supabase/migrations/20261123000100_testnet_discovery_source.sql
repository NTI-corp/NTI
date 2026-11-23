alter table tokens drop constraint if exists tokens_source_check;
alter table tokens add constraint tokens_source_check
  check (source in ('pons_v1', 'pons_v2', 'uniswap', 'testnet_mock'));
