import { RequestHandler } from "@builder.io/qwik-city";
import { renderToString } from "@builder.io/qwik/server";
import { getTweetImpl, Tweet, TweetJsonResponse } from "./tweet";

export const CACHE: Map<string, { script: string | null; timestamp: number }> =
  new Map();

const cacheTimeSec = 60;
export const token: string =
  "AAAAAAAAAAAAAAAAAAAAAGprkwEAAAAAckX3bcO3DhvGHHSS8PPyJWwLdtA%3DruJRNnn5tzBpk594xLUQ93H8w2UiOhQdpsRt6zLg1IgieFYaTM";

export const onGet: RequestHandler<string> = async ({
  params,
  headers,
  send,
  request,
  cacheControl,
}) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  let cacheItem = CACHE.get(pathname);
  const now = new Date().getTime();
  if (!cacheItem || now - cacheItem.timestamp > 1000 * cacheTimeSec) {
    cacheItem = { script: null, timestamp: now };
    CACHE.set(pathname, cacheItem);
  }
  if (!cacheItem.script) {
    const tweetId = params.tweetId;
    const tweet = await getTweetImpl(tweetId);
    const renderResult = await renderToString(
      <Tweet tweet={tweet as TweetJsonResponse} expandQuotedTweet={true} />,
      {
        containerTagName: "div",
        containerAttributes: {
          class: "tweet-container",
        },
        base: new URL("/build/", url).toString(),
      }
    );
    const html = renderResult.html;
    cacheItem.script = [
      `// Render: ${(1000000 * renderResult.timing.render).toFixed(0)}ms`,
      `// Snapshoot: ${(1000000 * renderResult.timing.snapshot).toFixed(0)}ms`,
      `(${clientBootstrap.toString()})(${JSON.stringify(
        pathname
      )}, ${JSON.stringify(html)})`,
    ].join("\n");
  }
  cacheControl({
    maxAge: cacheTimeSec,
    sMaxAge: cacheTimeSec,
    staleWhileRevalidate: cacheTimeSec,
  });
  headers.set("Content-Type", "text/javascript");
  headers.set("Access-Control-Allow-Origin", "*");
  send(200, cacheItem.script);
};

function clientBootstrap(pathname: string, html: string) {
  const currentScript = findCurrentScript();
  if (!currentScript) {
    console.error("Tweet not found", pathname);
    return;
  }
  const tweetParser = document.createElement("div");
  tweetParser.innerHTML = html;
  currentScript.parentNode!.insertBefore(
    tweetParser.firstElementChild!,
    currentScript
  );

  function findCurrentScript(): HTMLScriptElement | null {
    let script: HTMLScriptElement | null = null;
    Array.from(document.getElementsByTagName("script")).forEach((s) => {
      try {
        if (new URL(s.src).pathname === pathname) {
          script = s;
        }
      } catch (e) {
        // ignore
      }
    });
    return script;
  }
}
