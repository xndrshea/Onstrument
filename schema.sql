--
-- PostgreSQL database dump
--

-- Dumped from database version 17.2 (Homebrew)
-- Dumped by pg_dump version 17.2 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: onstrument; Type: SCHEMA; Schema: -; Owner: alexandershea
--

CREATE SCHEMA onstrument;


ALTER SCHEMA onstrument OWNER TO alexandershea;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: price_history; Type: TABLE; Schema: onstrument; Owner: alexandershea
--

CREATE TABLE onstrument.price_history (
    "time" timestamp with time zone NOT NULL,
    mint_address character varying(255) NOT NULL,
    open numeric(78,36) NOT NULL,
    high numeric(78,36) NOT NULL,
    low numeric(78,36) NOT NULL,
    close numeric(78,36) NOT NULL,
    volume numeric(78,36) DEFAULT 0,
    market_cap numeric(78,36) DEFAULT 0,
    is_buy boolean,
    trade_count integer DEFAULT 0,
    buy_count integer DEFAULT 0,
    sell_count integer DEFAULT 0
);


ALTER TABLE onstrument.price_history OWNER TO alexandershea;

--
-- Name: price_history_1d; Type: VIEW; Schema: onstrument; Owner: alexandershea
--

CREATE VIEW onstrument.price_history_1d AS
 SELECT _materialized_hypertable_8.bucket,
    _materialized_hypertable_8.mint_address,
    _materialized_hypertable_8.open,
    _materialized_hypertable_8.high,
    _materialized_hypertable_8.low,
    _materialized_hypertable_8.close,
    _materialized_hypertable_8.volume,
    _materialized_hypertable_8.market_cap,
    _materialized_hypertable_8.is_buy,
    _materialized_hypertable_8.trade_count,
    _materialized_hypertable_8.buy_count,
    _materialized_hypertable_8.sell_count
   FROM _timescaledb_internal._materialized_hypertable_8
  WHERE (_materialized_hypertable_8.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(8)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('1 day'::interval, price_history."time") AS bucket,
    price_history.mint_address,
    public.first(price_history.open, price_history."time") AS open,
    max(price_history.high) AS high,
    min(price_history.low) AS low,
    public.last(price_history.close, price_history."time") AS close,
    sum(price_history.volume) AS volume,
    public.last(price_history.market_cap, price_history."time") AS market_cap,
    bool_or(price_history.is_buy) AS is_buy,
    sum(price_history.trade_count) AS trade_count,
    sum(price_history.buy_count) AS buy_count,
    sum(price_history.sell_count) AS sell_count
   FROM onstrument.price_history
  WHERE (price_history."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(8)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('1 day'::interval, price_history."time")), price_history.mint_address;


ALTER VIEW onstrument.price_history_1d OWNER TO alexandershea;

--
-- Name: price_history_1h; Type: VIEW; Schema: onstrument; Owner: alexandershea
--

CREATE VIEW onstrument.price_history_1h AS
 SELECT _materialized_hypertable_7.bucket,
    _materialized_hypertable_7.mint_address,
    _materialized_hypertable_7.open,
    _materialized_hypertable_7.high,
    _materialized_hypertable_7.low,
    _materialized_hypertable_7.close,
    _materialized_hypertable_7.volume,
    _materialized_hypertable_7.market_cap,
    _materialized_hypertable_7.is_buy,
    _materialized_hypertable_7.trade_count,
    _materialized_hypertable_7.buy_count,
    _materialized_hypertable_7.sell_count
   FROM _timescaledb_internal._materialized_hypertable_7
  WHERE (_materialized_hypertable_7.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(7)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('01:00:00'::interval, price_history."time") AS bucket,
    price_history.mint_address,
    public.first(price_history.open, price_history."time") AS open,
    max(price_history.high) AS high,
    min(price_history.low) AS low,
    public.last(price_history.close, price_history."time") AS close,
    sum(price_history.volume) AS volume,
    public.last(price_history.market_cap, price_history."time") AS market_cap,
    bool_or(price_history.is_buy) AS is_buy,
    sum(price_history.trade_count) AS trade_count,
    sum(price_history.buy_count) AS buy_count,
    sum(price_history.sell_count) AS sell_count
   FROM onstrument.price_history
  WHERE (price_history."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(7)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('01:00:00'::interval, price_history."time")), price_history.mint_address;


ALTER VIEW onstrument.price_history_1h OWNER TO alexandershea;

--
-- Name: price_history_1m; Type: VIEW; Schema: onstrument; Owner: alexandershea
--

CREATE VIEW onstrument.price_history_1m AS
 SELECT _materialized_hypertable_6.bucket,
    _materialized_hypertable_6.mint_address,
    _materialized_hypertable_6.open,
    _materialized_hypertable_6.high,
    _materialized_hypertable_6.low,
    _materialized_hypertable_6.close,
    _materialized_hypertable_6.volume,
    _materialized_hypertable_6.market_cap,
    _materialized_hypertable_6.is_buy,
    _materialized_hypertable_6.trade_count,
    _materialized_hypertable_6.buy_count,
    _materialized_hypertable_6.sell_count
   FROM _timescaledb_internal._materialized_hypertable_6
  WHERE (_materialized_hypertable_6.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(6)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('00:01:00'::interval, price_history."time") AS bucket,
    price_history.mint_address,
    public.first(price_history.open, price_history."time") AS open,
    max(price_history.high) AS high,
    min(price_history.low) AS low,
    public.last(price_history.close, price_history."time") AS close,
    sum(price_history.volume) AS volume,
    public.last(price_history.market_cap, price_history."time") AS market_cap,
    bool_or(price_history.is_buy) AS is_buy,
    sum(price_history.trade_count) AS trade_count,
    sum(price_history.buy_count) AS buy_count,
    sum(price_history.sell_count) AS sell_count
   FROM onstrument.price_history
  WHERE (price_history."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(6)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('00:01:00'::interval, price_history."time")), price_history.mint_address;


ALTER VIEW onstrument.price_history_1m OWNER TO alexandershea;

--
-- Name: subscription_history; Type: TABLE; Schema: onstrument; Owner: alexandershea
--

CREATE TABLE onstrument.subscription_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    payment_tx_id text NOT NULL,
    tier_type text NOT NULL,
    amount_paid numeric NOT NULL,
    duration_months integer NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE onstrument.subscription_history OWNER TO alexandershea;

--
-- Name: tokens; Type: TABLE; Schema: onstrument; Owner: alexandershea
--

CREATE TABLE onstrument.tokens (
    mint_address character varying(255) NOT NULL,
    name character varying(255),
    symbol character varying(20),
    decimals integer,
    token_type character varying(10) NOT NULL,
    description text,
    website_url text,
    docs_url text,
    twitter_url text,
    telegram_url text,
    metadata_url text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    curve_address character varying(255),
    curve_config jsonb,
    interface character varying(50),
    content jsonb,
    authorities jsonb,
    compression jsonb,
    "grouping" jsonb,
    royalty jsonb,
    creators jsonb,
    ownership jsonb,
    supply jsonb,
    mutable boolean,
    burnt boolean,
    token_info jsonb,
    verified boolean DEFAULT false,
    image_url text,
    attributes jsonb,
    price_sol numeric(78,36),
    off_chain_metadata jsonb,
    metadata_status character varying(50),
    metadata_source character varying(50),
    metadata_fetch_attempts integer DEFAULT 0,
    last_metadata_fetch timestamp with time zone,
    token_vault character varying(255),
    market_cap_usd numeric(78,36),
    fully_diluted_value_usd numeric(78,36),
    price_change_5m numeric(78,36),
    price_change_1h numeric(78,36),
    price_change_6h numeric(78,36),
    price_change_24h numeric(78,36),
    price_change_7d numeric(78,36),
    price_change_30d numeric(78,36),
    token_source character varying(20) DEFAULT 'custom'::character varying NOT NULL,
    last_price_update timestamp with time zone,
    current_price numeric(78,36),
    volume_5m numeric(78,36) DEFAULT 0,
    volume_1h numeric(78,36) DEFAULT 0,
    volume_6h numeric(78,36) DEFAULT 0,
    volume_24h numeric(78,36) DEFAULT 0,
    volume_7d numeric(78,36) DEFAULT 0,
    volume_30d numeric(78,36) DEFAULT 0,
    apr_24h numeric(78,36) DEFAULT 0,
    apr_7d numeric(78,36) DEFAULT 0,
    apr_30d numeric(78,36) DEFAULT 0,
    tvl numeric(78,36),
    tx_5m_buys integer DEFAULT 0,
    tx_5m_sells integer DEFAULT 0,
    tx_5m_buyers integer DEFAULT 0,
    tx_5m_sellers integer DEFAULT 0,
    tx_1h_buys integer DEFAULT 0,
    tx_1h_sells integer DEFAULT 0,
    tx_1h_buyers integer DEFAULT 0,
    tx_1h_sellers integer DEFAULT 0,
    tx_6h_buys integer DEFAULT 0,
    tx_6h_sells integer DEFAULT 0,
    tx_6h_buyers integer DEFAULT 0,
    tx_6h_sellers integer DEFAULT 0,
    tx_24h_buys integer DEFAULT 0,
    tx_24h_sells integer DEFAULT 0,
    tx_24h_buyers integer DEFAULT 0,
    tx_24h_sellers integer DEFAULT 0,
    reserve_in_usd numeric(78,36),
    base_token_price_native_currency numeric(78,36),
    quote_token_price_native_currency numeric(78,36),
    dexscreener_checked boolean DEFAULT false,
    dexscreener_checked_at timestamp with time zone,
    CONSTRAINT valid_token_source CHECK (((token_source)::text = ANY ((ARRAY['custom'::character varying, 'raydium'::character varying, 'geckoterminal'::character varying])::text[]))),
    CONSTRAINT valid_token_type CHECK (((token_type)::text = ANY ((ARRAY['custom'::character varying, 'dex'::character varying])::text[])))
);


ALTER TABLE onstrument.tokens OWNER TO alexandershea;

--
-- Name: trades; Type: TABLE; Schema: onstrument; Owner: alexandershea
--

CREATE TABLE onstrument.trades (
    "time" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    signature text NOT NULL,
    token_address text NOT NULL,
    token_type text NOT NULL,
    wallet_address text NOT NULL,
    side text NOT NULL,
    amount numeric(78,36) NOT NULL,
    total numeric(78,36) NOT NULL,
    price numeric(78,36) NOT NULL,
    slot bigint NOT NULL
);


ALTER TABLE onstrument.trades OWNER TO alexandershea;

--
-- Name: user_trading_stats; Type: TABLE; Schema: onstrument; Owner: alexandershea
--

CREATE TABLE onstrument.user_trading_stats (
    user_id uuid NOT NULL,
    mint_address character varying(255) NOT NULL,
    total_trades integer DEFAULT 0,
    total_volume numeric(78,36) DEFAULT 0,
    total_buy_volume numeric(78,36) DEFAULT 0,
    total_sell_volume numeric(78,36) DEFAULT 0,
    first_trade_at timestamp with time zone,
    last_trade_at timestamp with time zone
);


ALTER TABLE onstrument.user_trading_stats OWNER TO alexandershea;

--
-- Name: users; Type: TABLE; Schema: onstrument; Owner: alexandershea
--

CREATE TABLE onstrument.users (
    user_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wallet_address text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    subscription_expires_at timestamp with time zone,
    is_subscribed boolean DEFAULT false,
    subscription_tier text,
    golden_points integer DEFAULT 0
);


ALTER TABLE onstrument.users OWNER TO alexandershea;

--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (mint_address, "time");


--
-- Name: subscription_history subscription_history_pkey; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.subscription_history
    ADD CONSTRAINT subscription_history_pkey PRIMARY KEY (id);


--
-- Name: tokens tokens_pkey; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.tokens
    ADD CONSTRAINT tokens_pkey PRIMARY KEY (mint_address);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY ("time", signature);


--
-- Name: user_trading_stats user_trading_stats_pkey; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.user_trading_stats
    ADD CONSTRAINT user_trading_stats_pkey PRIMARY KEY (user_id, mint_address);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: users users_wallet_address_key; Type: CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.users
    ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);


--
-- Name: idx_subscription_history_payment_tx; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE UNIQUE INDEX idx_subscription_history_payment_tx ON onstrument.subscription_history USING btree (payment_tx_id);


--
-- Name: idx_subscription_history_user_id; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_subscription_history_user_id ON onstrument.subscription_history USING btree (user_id);


--
-- Name: idx_tokens_metadata_status; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_tokens_metadata_status ON onstrument.tokens USING btree (metadata_status);


--
-- Name: idx_tokens_source; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_tokens_source ON onstrument.tokens USING btree (token_source);


--
-- Name: idx_tokens_symbol; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_tokens_symbol ON onstrument.tokens USING btree (symbol);


--
-- Name: idx_tokens_token_vault; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_tokens_token_vault ON onstrument.tokens USING btree (token_vault);


--
-- Name: idx_tokens_type; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_tokens_type ON onstrument.tokens USING btree (token_type);


--
-- Name: idx_tokens_verified; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_tokens_verified ON onstrument.tokens USING btree (verified);


--
-- Name: idx_trades_token_time; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_trades_token_time ON onstrument.trades USING btree (token_address, "time" DESC);


--
-- Name: idx_user_trading_stats_mint; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_user_trading_stats_mint ON onstrument.user_trading_stats USING btree (mint_address);


--
-- Name: idx_user_trading_stats_user; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_user_trading_stats_user ON onstrument.user_trading_stats USING btree (user_id);


--
-- Name: idx_users_wallet; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX idx_users_wallet ON onstrument.users USING btree (wallet_address);


--
-- Name: price_history_time_idx; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX price_history_time_idx ON onstrument.price_history USING btree ("time" DESC);


--
-- Name: trades_time_idx; Type: INDEX; Schema: onstrument; Owner: alexandershea
--

CREATE INDEX trades_time_idx ON onstrument.trades USING btree ("time" DESC);


--
-- Name: price_history ts_cagg_invalidation_trigger; Type: TRIGGER; Schema: onstrument; Owner: alexandershea
--

CREATE TRIGGER ts_cagg_invalidation_trigger AFTER INSERT OR DELETE OR UPDATE ON onstrument.price_history FOR EACH ROW EXECUTE FUNCTION _timescaledb_functions.continuous_agg_invalidation_trigger('1');


--
-- Name: price_history ts_insert_blocker; Type: TRIGGER; Schema: onstrument; Owner: alexandershea
--

CREATE TRIGGER ts_insert_blocker BEFORE INSERT ON onstrument.price_history FOR EACH ROW EXECUTE FUNCTION _timescaledb_functions.insert_blocker();


--
-- Name: trades ts_insert_blocker; Type: TRIGGER; Schema: onstrument; Owner: alexandershea
--

CREATE TRIGGER ts_insert_blocker BEFORE INSERT ON onstrument.trades FOR EACH ROW EXECUTE FUNCTION _timescaledb_functions.insert_blocker();


--
-- Name: subscription_history subscription_history_user_id_fkey; Type: FK CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.subscription_history
    ADD CONSTRAINT subscription_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES onstrument.users(user_id);


--
-- Name: user_trading_stats user_trading_stats_mint_address_fkey; Type: FK CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.user_trading_stats
    ADD CONSTRAINT user_trading_stats_mint_address_fkey FOREIGN KEY (mint_address) REFERENCES onstrument.tokens(mint_address);


--
-- Name: user_trading_stats user_trading_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: onstrument; Owner: alexandershea
--

ALTER TABLE ONLY onstrument.user_trading_stats
    ADD CONSTRAINT user_trading_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES onstrument.users(user_id);


--
-- PostgreSQL database dump complete
--

