import { component$, useSignal, useStylesScoped$ } from "@builder.io/qwik";
import { action$, DocumentHead, loader$ } from "@builder.io/qwik-city";
import CSS from "./index.css?inline";
import { getRenderedTweet } from "./tweet/[tweetId]";

export const PLACEHOLDER_TWEET_ID = "1606438382561026049";
export const PLACEHOLDER_TWEET =
  "https://twitter.com/mhevery/status/" + PLACEHOLDER_TWEET_ID;

export const tweetAction = action$((form) => {
  const tweetURL = (form.get("tweetURL") as string) || PLACEHOLDER_TWEET;
  const tweetID = tweetURL.split("/").pop()!;
  return { tweetURL, tweetID };
});

export const tweetLoader = loader$(async ({ getData, request }) => {
  const actionData = await getData(tweetAction);
  const tweetID = actionData?.tweetID || PLACEHOLDER_TWEET_ID;
  const baseURL = new URL(request.url);
  baseURL.pathname = "";
  baseURL.search = "";
  baseURL.hash = "";
  const renderedTweet = await getRenderedTweet(tweetID, new URL(request.url));
  return {
    tweetURL: actionData?.tweetURL || PLACEHOLDER_TWEET,
    tweetID: tweetID,
    baseURL: baseURL.toString(),
    html: renderedTweet ? renderedTweet.html : "INVALID TWEET URL",
  };
});

export default component$(() => {
  useStylesScoped$(CSS);
  const onTweet = tweetAction.use();
  const tweet = tweetLoader.use();
  const jsRef = useSignal<HTMLTextAreaElement>();
  const htmlRef = useSignal<HTMLTextAreaElement>();

  const tweetURL = tweet.value!.tweetURL;
  const tweetID = tweet.value!.tweetID;
  const baseURL = tweet.value!.baseURL;
  const jsOnly = `<script type="module" async src="${baseURL}tweet/${tweetID}"></script>`;
  const htmlAndJs = `${tweet.value!.html}\n${jsOnly}`;
  return (
    <div>
      <form
        action={onTweet.actionPath + "&qwikcity.static=false"}
        method="POST"
      >
        <label>Tweet URL</label>
        <input type="text" name="tweetURL" value={tweetURL} />
        <button type="submit">Submit</button>
      </form>
      <div>
        <label onClick$={() => copy(jsRef.value!)} class="cursor">
          <CopyIcon />
          {" JS only "}({jsOnly.length + 0} Bytes)
        </label>
        <textarea
          name="tweet"
          rows={10}
          cols={80}
          disabled
          value={jsOnly}
          ref={jsRef}
        />
      </div>
      <div>
        <label onClick$={() => copy(htmlRef.value!)} class="cursor">
          <CopyIcon />
          {" HTML + JS"}({Math.round(htmlAndJs.length / 1024)} kB)
        </label>
        <textarea
          name="tweet"
          rows={10}
          cols={80}
          disabled
          value={htmlAndJs}
          ref={htmlRef}
        />
      </div>
      <hr />
      <RenderTweet html={htmlAndJs} />
    </div>
  );
});

export const RenderTweet = component$<{ html: string }>((props) => {
  return <div dangerouslySetInnerHTML={props.html}></div>;
});

export function copy(input: HTMLTextAreaElement): void {
  input.classList.add("active");
  input.select();
  input.setSelectionRange(0, 99999); // For mobile devices
  navigator.clipboard.writeText(input.value);
  console.log('Copied to clipboard: "' + input.value + '"');
  setTimeout(() => input.classList.remove("active"), 200);
}

export const head: DocumentHead = {
  title: "Welcome to Qwik",
  meta: [
    {
      name: "description",
      content: "Qwik site description",
    },
  ],
};

export const CopyIcon = () => {
  const width = 18;
  const height = width * (448 / 512);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 448 512"
      width={width}
      height={height}
    >
      <path d="M433.941 65.941l-51.882-51.882A48 48 0 0 0 348.118 0H176c-26.51 0-48 21.49-48 48v48H48c-26.51 0-48 21.49-48 48v320c0 26.51 21.49 48 48 48h224c26.51 0 48-21.49 48-48v-48h80c26.51 0 48-21.49 48-48V99.882a48 48 0 0 0-14.059-33.941zM266 464H54a6 6 0 0 1-6-6V150a6 6 0 0 1 6-6h74v224c0 26.51 21.49 48 48 48h96v42a6 6 0 0 1-6 6zm128-96H182a6 6 0 0 1-6-6V54a6 6 0 0 1 6-6h106v88c0 13.255 10.745 24 24 24h88v202a6 6 0 0 1-6 6zm6-256h-64V48h9.632c1.591 0 3.117.632 4.243 1.757l48.368 48.368a6 6 0 0 1 1.757 4.243V112z" />
    </svg>
  );
};
