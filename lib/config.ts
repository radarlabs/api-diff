import * as fs from 'fs';
import * as hjson from 'hjson';

const noConfigFile = process.env.CONFIG_FILE === '';
const CONFIG_FILE = process.env.CONFIG_FILE || 'config.hjson';

export type ConfigHostEntry = {
  host: string;
  aliases?: string[];
  protocol?: 'http' | 'https';
  takesArg?: boolean;
  keyEnv?: string;
};

export type Config = {
  authStyle?: 'header' | 'param';
  authParam?: string;
  keyTypes?: string[];
  hosts: Record<string, ConfigHostEntry>;
};

if (!noConfigFile && !fs.existsSync(CONFIG_FILE)) {
  throw new Error(`${CONFIG_FILE} missing`);
}
const config = hjson.parse(noConfigFile ? '' : fs.readFileSync(CONFIG_FILE).toString()) as Config;
export default config;
