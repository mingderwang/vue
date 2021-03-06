import axios from "axios";
import {
  Secp256k1Wallet,
  SigningCosmosClient,
  makeCosmoshubPath,
  coins,
} from "@cosmjs/launchpad";
const bs58 = require('bs58')

const GITPOD =
  process.env.VUE_APP_CUSTOM_URL && new URL(process.env.VUE_APP_CUSTOM_URL);
const API =
  (GITPOD && `${GITPOD.protocol}//1317-${GITPOD.hostname}`) ||
  process.env.VUE_APP_API_COSMOS ||
  "http://localhost:1317";
const RPC =
  (GITPOD && `${GITPOD.protocol}//26657-${GITPOD.hostname}`) ||
  process.env.VUE_APP_API_TENDERMINT ||
  "http://localhost:26657";
const WS =
  (GITPOD && `wss://26657-${GITPOD.hostname}/websocket`) ||
  process.env.VUE_APP_WS_TENDERMINT ||
  "ws://localhost:26657/websocket";
const ADDR_PREFIX = process.env.VUE_APP_ADDRESS_PREFIX || "cosmos";

export default {
  namespaced: true,
  state: {
    account: {},
    client: null,
    chain_id: "",
    bankBalances: [],
    data: [],
    did: "",
    diddoc: "",
  },
  mutations: {
    set(state, { key, value }) {
      state[key] = value;
    },
    entitySet(state, { type, body, module }) {
      const updated = {};
      updated[`${module}/${type}`] = body;
      state.data = { ...state.data, ...updated };
    },
  },
  actions: {
    async init({ dispatch }) {
      // dispatch("stakingPoolFetch");
      // dispatch("validatorsFetch");
      await dispatch("chainIdFetch");
      await dispatch("accountSignInTry");
    },
    async accountSignInTry({ dispatch }) {
      const mnemonic = localStorage.getItem("mnemonic");
      if (mnemonic) {
        await dispatch("accountSignIn", { mnemonic });
      }
    },
    async chainIdFetch({ commit }) {
      const url = `${API}/node_info`;
      const value = (await axios.get(url)).data.node_info.network;
      commit("set", { key: "chain_id", value });
    },
    accountSignIn({ commit, dispatch }, { mnemonic }) {
      return new Promise(async (resolve, reject) => {
        const wallet = await Secp256k1Wallet.fromMnemonic(
          mnemonic,
          makeCosmoshubPath(0),
          ADDR_PREFIX
        );
        localStorage.setItem("mnemonic", mnemonic);
        const [{ address }] = await wallet.getAccounts();
        console.log(address)
        const url = `${API}/auth/accounts/${address}`;
        const acc = (await axios.get(url)).data;
        console.log(acc)
        const account = acc.result.value;
        const client = new SigningCosmosClient(API, address, wallet);
        commit("set", { key: "account", value: account });
        const pkbs58 = bs58.encode(wallet.pubkey)
        const did = "did:cosm:" + address
        commit("set", { key: "did", value: did })
        const doc = {
          "@context": [
            "https://www.w3.org/ns/did/v1"
          ],
          "id": did,
          "authentication": [
            {
              "id": did,
              "type": "secp256k1",
              "controller": did + "#key-1",
              "publicKeyBase58": pkbs58
            }
          ],
          "service": [
                {
                  "id": did + '#cvs',
                  "type": "VerifiableCredentialService",
                  "serviceEndpoint": "http://cosmos-did.muzamint.com/vc/"
                }
              ]
        }
        console.log(doc)
        commit("set", { key: "diddoc", value: doc });
        commit("set", { key: "client", value: client });
        // // dispatch("delegationsFetch");
        // // dispatch("transfersIncomingFetch");
        // // dispatch("transfersOutgoingFetch");
        try {
          await dispatch("bankBalancesGet");
        } catch {
          console.log("Error in getting a bank balance.");
        }
        // resolve(account);
      });
    },
    async tokenSend({ state }, { amount, denom, to_address, memo = "" }) {
      const from_address = state.client.senderAddress;
      const msg = {
        type: "cosmos-sdk/MsgSend",
        value: {
          amount: [
            {
              amount,
              denom,
            },
          ],
          from_address,
          to_address,
        },
      };
      const fee = {
        amount: coins(0, denom),
        gas: "200000",
      };
      console.log({fee,msg})
      return await state.client.signAndPost([msg], fee, memo);
    },
    async bankBalancesGet({ commit, state }) {
      const { address } = state.account;
      const url = `${API}/bank/balances/${address}`;
      const value = (await axios.get(url)).data.result;
      commit("set", { key: "bankBalances", value });
    },
    async accountSignOut({ commit }) {
      localStorage.removeItem("mnemonic");
      window.location.reload();
    },
    async entityFetch({ state, commit, dispatch }, { type, module }) {
      if (!state.chain_id) {
        await dispatch("chainIdFetch");
      }
      const module_name = module || state.chain_id;
      const url = `${API}/${module_name}/${type}`;
      const body = (await axios.get(url)).data.result;
      commit("entitySet", { type, body, module });
    },
    async entitySubmit({ state }, { type, body, module }) {
      const { chain_id, diddoc } = state;
      const creator = state.client.senderAddress;
      const base_req = { chain_id, from: creator };
      const req = { base_req, creator, ...body };
      Promise.resolve(req).then(res => {
        console.log(res)
      })
      var copy = {}
for (var key in req) {
    if (req.hasOwnProperty(key)) {
        copy[key] = req[key];
        if (key === 'diddoc') {
          copy[key] = JSON.stringify(state.diddoc)
        }
    }
}

console.log(JSON.stringify(state.diddoc))
    
        const module_name = module || chain_id;
        const { data } = await axios.post(`${API}/${module_name}/${type}`, copy);
        const { msg, fee, memo } = data.value;
        return await state.client.signAndPost(msg, fee, memo);
    },
  },
};
