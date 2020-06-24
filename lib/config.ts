const hjson = require("hjson");
import * as fs from "fs";

const CONFIG_FILE = "config.hjson";

export type ConfigHostEntry = {
  host: string;
  aliases?: string[];
  protocol?: "http" | "https";
  takesArg?: boolean;
  keyEnv?: string;
};

export type Config = {
  authStyle?: "header" | "param";
  authParam?: string;
  keyTypes?: string[];
  hosts: Record<string, ConfigHostEntry>;
};

if (!fs.existsSync(CONFIG_FILE)) {
  throw new Error(`${CONFIG_FILE} missing`);
}
const config = hjson.parse(fs.readFileSync(CONFIG_FILE).toString()) as Config;
export default config;

