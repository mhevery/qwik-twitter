import { RequestHandler } from "@builder.io/qwik-city";
import { renderToString } from "@builder.io/qwik/server";
import { getTweetImpl, isTweetError, Tweet, TweetJsonResponse } from "./tweet";

export interface RenderedTweet {
  script: string | null;
  timestamp: number;
  html: string | null;
}
export const CACHE: Map<string, RenderedTweet> = new Map();

const cacheTimeSec = 60 * 60;

export const onGet: RequestHandler<string> = async ({
  params,
  headers,
  send,
  cacheControl,
  request,
}) => {
  const renderedTweet = await getRenderedTweet(
    params.tweetId,
    new URL(request.url)
  );
  cacheControl({
    maxAge: cacheTimeSec,
    sMaxAge: cacheTimeSec,
    staleWhileRevalidate: cacheTimeSec,
  });
  headers.set("Content-Type", "text/javascript");
  headers.set("Access-Control-Allow-Origin", "*");
  send(
    200,
    renderedTweet ? renderedTweet.script : 'console.log("INVALID TWEET URL")'
  );
};

export async function getRenderedTweet(
  tweetID: string,
  requestURL: URL
): Promise<RenderedTweet | null> {
  let cacheItem = CACHE.get(tweetID);
  const now = new Date().getTime();
  if (!cacheItem || now - cacheItem.timestamp > 1000 * cacheTimeSec) {
    cacheItem = { script: null, timestamp: now, html: null };
    CACHE.set(tweetID, cacheItem);
  }
  if (!cacheItem.script) {
    const tweet = await getTweetImpl(tweetID);
    if (!tweet || isTweetError(tweet)) {
      return null;
    }
    const renderResult = await renderToString(
      <Tweet tweet={tweet as TweetJsonResponse} expandQuotedTweet={true} />,
      {
        containerTagName: "div",
        containerAttributes: {
          class: "tweet-container",
          "tweet-id": `/tweet/${tweetID}`,
          style: "max-width: 400px",
        },
        base: new URL("/build/", requestURL).toString(),
      }
    );
    cacheItem.html = renderResult.html;
    cacheItem.script = [
      `// Render: ${(1000000 * renderResult.timing.render).toFixed(0)}ms`,
      `// Snapshot: ${(1000000 * renderResult.timing.snapshot).toFixed(0)}ms`,
      `(${clientBootstrap.toString()})(${JSON.stringify(
        `/tweet/${tweetID}`
      )}, ${JSON.stringify(cacheItem.html)})`,
    ].join("\n");
  }
  return cacheItem;
}

function clientBootstrap(pathname: string, html: string) {
  const currentScript = findCurrentScript();
  if (!currentScript) {
    console.error("Tweet not found", pathname);
    return;
  }
  const tweetParser = document.createElement("div");
  tweetParser.innerHTML = html;
  const existingTweet = document.querySelector(`[tweet-id="${pathname}"]`);
  if (existingTweet) {
    const parent = existingTweet.parentNode!;
    parent.insertBefore(tweetParser.firstElementChild!, existingTweet);
    parent.removeChild(existingTweet);
  } else {
    while (tweetParser.firstChild) {
      currentScript.parentNode!.insertBefore(
        tweetParser.firstChild!,
        currentScript
      );
    }
  }
  currentScript.setAttribute("applied", "true");

  function findCurrentScript(): HTMLScriptElement | null {
    let script: HTMLScriptElement | null = null;
    Array.from(document.getElementsByTagName("script")).forEach((s) => {
      try {
        if (
          new URL(s.src).pathname === pathname &&
          s.getAttribute("applied") === null
        ) {
          script = s;
        }
      } catch (e) {
        // ignore
      }
    });
    return script;
  }
}
