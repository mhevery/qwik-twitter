declare const TWITTER_BEARER_TOKEN: string;

((global: { TWITTER_BEARER_TOKEN?: string }) => {
  if (!global.TWITTER_BEARER_TOKEN) {
    if (
      !(global.TWITTER_BEARER_TOKEN = import.meta.env.VITE_TWITTER_BEARER_TOKEN)
    ) {
      throw new Error("TWITTER_BEARER_TOKEN is not defined");
    }
  }
})(globalThis as any);

export default {
  TWITTER_BEARER_TOKEN,
};
