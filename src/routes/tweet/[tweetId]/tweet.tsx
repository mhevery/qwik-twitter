// The code here is heavily borrowed/copied with permission from
// https://github.com/kentcdodds/kentcdodds.com/blob/main/app/utils/twitter.server.ts#L152
import {
  component$,
  Resource,
  useResource$,
  useStylesScoped$,
} from "@builder.io/qwik";
import { JSX } from "@builder.io/qwik/jsx-runtime";
import env from "~/env";
import CSS from "./tweet.css?inline";

type Link = {
  shortLink: string;
  isTwitterLink: boolean;
  longLink: string;
  longUrl: URL;
  metadata: Metadata | null;
};
type Metadata = {
  // metascraper has types, but they just say all these values will be there
  // whether you're actually parsing for them or not.
  title?: string;
  description?: string;
  image?: string;
};
type Latitude = number;
type Longitude = number;
type Media = {
  media_key: string;
  type: "photo" | "animated_gif" | "video";
  url: string;
  preview_image_url?: string;
};
type TweetData = {
  id: string;
  author_id: string;
  text: string;
  created_at: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
  in_reply_to_user_id?: string;
  attachments?: { media_keys: Array<string> };
  referenced_tweets?: Array<{
    type: "replied_to" | "retweeted" | "quoted";
    id: string;
  }>;
  entities?: {
    mentions: Array<{
      start: number;
      end: number;
      username: string;
      id: string;
    }>;
  };

  geo?: {
    place_id: string;
    full_name: string;
    geo: {
      type: "Feature";
      bbox: [Latitude, Longitude, Latitude, Longitude];
      properties: {};
    };
  };
};
type User = {
  id: string;
  url: string;
  name: string;
  username: string;
  profile_image_url: string;
};
export type TweetJsonResponse = {
  data: TweetData;
  includes: {
    users?: Array<User>;
    media?: Array<Media>;
    tweets: Array<TweetData>;
  };
};

type TweetErrorJsonResponse = {
  errors: Array<{
    value: string;
    detail: string;
    title: "Not Found Error";
    resource_type: "tweet";
    parameter: "id";
    resource_id: string;
    type: string;
  }>;
};

type TweetRateLimitErrorJsonResponse = {
  title: "Too Many Requests";
  detail: "Too Many Requests";
  type: "about:blank";
  status: 429;
};

type TweetResponse =
  | TweetJsonResponse
  | TweetErrorJsonResponse
  | TweetRateLimitErrorJsonResponse;

export async function getTweetImpl(tweetId: string): Promise<TweetResponse> {
  const url = new URL(`https://api.twitter.com/2/tweets/${tweetId}`);
  const params = {
    "tweet.fields": "public_metrics,created_at",
    expansions:
      "author_id,attachments.media_keys,entities.mentions.username,in_reply_to_user_id,referenced_tweets.id,referenced_tweets.id.author_id,geo.place_id",
    "user.fields": "name,username,url,profile_image_url",
    "media.fields": "preview_image_url,url,type",
    "place.fields": "full_name,geo",
  };
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`,
    },
  });
  const tweetJson = await response.json();
  return tweetJson as TweetResponse;
}

export async function unshorten(
  urlString: string,
  maxFollows: number = 10
): Promise<string> {
  const url = new URL(urlString);
  const headers = new Headers({
    "User-Agent": "ignore",
  });
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "manual",
    mode: "no-cors",
    headers: headers,
  });
  const location =
    response.headers.get("location") ||
    // This is a work around for the platform bug which does not allow
    // HEAD requests and reading of `location` header.
    ((await getMetadata(urlString)) as any).redirect;
  if (location && location !== urlString && maxFollows > 0) {
    const fullLocation = location.startsWith("/")
      ? new URL(location, url).toString()
      : location;
    return unshorten(fullLocation, maxFollows - 1);
  }
  return urlString;
}

export const Tweet = component$<{
  tweet: TweetJsonResponse;
  expandQuotedTweet: boolean;
}>((props) => {
  useStylesScoped$(CSS);
  const author = props.tweet.includes.users?.find(
    (user) => user.id === props.tweet.data.author_id
  );
  if (!author) {
    console.error(props.tweet.data.author_id, props.tweet.includes.users);
    throw new Error("unable to find tweet author");
  }

  const tweetURL = `https://twitter.com/${author.username}/status/${props.tweet.data.id}`;

  const linkRsrc = useResource$<Link[]>(async () => {
    const tweet = props.tweet;
    return (
      await Promise.all(
        [...tweet.data.text.matchAll(/https:\/\/t.co\/\w+/g)].map(
          async ([shortLink]) => {
            if (!shortLink) return;
            const longLink = await unshorten(shortLink).catch(() => shortLink);
            const longUrl = new URL(longLink);
            const isTwitterLink = longUrl.host === "twitter.com";
            let metadata: Metadata | null = null;

            if (!isTwitterLink) {
              // we don't want to get metadata for tweets.
              metadata = await getMetadata(longLink).catch(() => null);
            }

            return {
              shortLink,
              isTwitterLink,
              longLink,
              longUrl,
              metadata,
            };
          }
        )
      )
    ).filter(typedBoolean);
  });

  return (
    <div class="tweet-embed">
      <Author author={author} />
      <Resource
        value={linkRsrc}
        onResolved={(links) => (
          <>
            <TweetText tweet={props.tweet} links={links} />
            <Media tweet={props.tweet} link={tweetURL} />
            {props.tweet.includes.media ? null : <LinkMetadata links={links} />}
          </>
        )}
      />
      <ExpandedQuote
        tweet={props.tweet}
        expandQuotedTweet={props.expandQuotedTweet}
      />
      <CreatedAt tweet={props.tweet} tweetURL={tweetURL} />
      <Stats tweet={props.tweet} tweetURL={tweetURL} />
    </div>
  );
});

export function Author({ author }: { author: User }) {
  // _normal is only 48x48 which looks bad on high-res displays
  // _bigger is 73x73 which looks better...
  return (
    <a
      class="tweet-author"
      href={"https://twitter.com/" + author.username}
      target="_blank"
      rel="noreferrer noopener"
    >
      <img
        src={author.profile_image_url.replace("_normal", "_bigger")}
        loading="lazy"
        alt={author.name + " avatar"}
      />
      <div>
        <span class="tweet-author-name">{author.name}</span>
        <span class="tweet-author-handle">@{author.username}</span>
      </div>
    </a>
  );
}

export function TweetText({
  tweet,
  links,
}: {
  tweet: TweetJsonResponse;
  links: Link[];
}) {
  const parts = splitOnLinksAndNewlines(
    tweet.data.text,
    links,
    tweet.includes.media
  );
  return (
    <blockquote>
      {parts.map((text) =>
        isUrl(text) ? (
          <a
            href={
              isHandle(text) ? "https://twitter.com/" + text.substring(1) : text
            }
            class={isHandle(text) ? "" : "tweet-link"}
            target="_blank"
            rel="noreferrer noopener"
          >
            {isHandle(text) ? text : toLink(links, text)}
          </a>
        ) : text == "\n" ? (
          <br />
        ) : (
          <span>{text}</span>
        )
      )}
    </blockquote>
  );
}

function isUrl(text: string) {
  return isHandle(text) || text.startsWith("https://");
}

function splitOnLinksAndNewlines(text: string, links: Link[], media?: Media[]) {
  const parts: string[] = [];
  splitOnLinks(text).forEach((text, idx) => {
    if (idx % 2 === 1) {
      parts.push(text);
    } else {
      text.split("\n").forEach((line) => {
        line && parts.push(line);
        parts.push("\n");
      });
    }
  });
  media?.forEach((media) => {
    // if (!media.url) return;
    const last = parts[parts.length - 1];
    const expandLink = toLink(links, last);
    if (
      expandLink === media.url ||
      expandLink == media.preview_image_url ||
      expandLink.startsWith("https://twitter.com/")
    ) {
      // trim any trailing URLs which point to existing media
      parts.pop();
    }
    while (parts[parts.length - 1] === "\n") {
      // trim any trailing newlines
      parts.pop();
    }
  });
  return parts;
}

function isHandle(text: string) {
  return text.startsWith("@");
}

function toLink(links: Link[], text: string): string {
  if (isHandle(text)) {
    return "https://twitter.com/" + text.substring(1);
  } else {
    return links.find((l) => l.shortLink === text)?.longLink ?? text;
  }
}

function splitOnLinks(text: string): string[] {
  const parts: string[] = [];
  while (text.length) {
    const idx = Math.min(indexOf(text, "@"), indexOf(text, "https://t.co/"));
    if (idx === text.length) {
      parts.push(text);
      text = "";
    } else {
      const end = findEnd(text, idx);
      parts.push(text.substring(0, idx));
      parts.push(text.substring(idx, end));
      text = text.substring(end);
    }
  }
  return parts;
}

function indexOf(text: string, value: string): number {
  const idx = text.indexOf(value);
  return idx === -1 ? text.length : idx;
}

function findEnd(text: string, idx: number): number {
  for (let i = idx; i < text.length; i++) {
    const ch = text[i];
    if (ch <= " ") return i;
  }
  return text.length;
}

export const Media = ({
  tweet,
  link,
}: {
  tweet: TweetJsonResponse;
  link?: string;
}) => {
  const medias = tweet.includes.media ?? [];
  return (
    <Wrap
      if={link}
      with={(children: any) => (
        <a href={link} target="_blank" rel="noreferrer noopener">
          {children}
        </a>
      )}
    >
      <div class="tweet-media-container">
        <div class="tweet-media-grid" data-count={medias.length}>
          {medias.map((media) => {
            return (
              <Wrap
                if={media.type === "animated_gif" || media.type === "video"}
                with={(children: any) => (
                  <div class="tweet-media-with-play-button">
                    <div class="tweet-media-play-button">
                      <PlaySvg />
                    </div>
                    {children}
                  </div>
                )}
              >
                <img
                  src={media.preview_image_url ?? media.url}
                  width={medias.length > 1 ? "50%" : "100%"}
                  loading="lazy"
                  alt="Tweet media"
                />
              </Wrap>
            );
          })}
        </div>
      </div>
    </Wrap>
  );
};

function Wrap(props: {
  if: any;
  with: (children: JSX.Element) => JSX.Element;
  children: JSX.Element;
}) {
  return props.if ? props.with(props.children) : props.children;
}

export const LinkMetadata = (props: { links: Link[] }) => {
  const lastMetadataLink = props.links.reverse().find((l) => l.metadata);
  return (
    <>
      {lastMetadataLink && lastMetadataLink.metadata?.title ? (
        <a
          href={lastMetadataLink.longLink}
          class="tweet-ref-metadata"
          target="_blank"
          rel="noreferrer noopener"
        >
          {lastMetadataLink.metadata?.image ? (
            <img
              class="tweet-ref-metadata-image"
              src={lastMetadataLink.metadata?.image}
              loading="lazy"
              alt="Referenced media"
            />
          ) : null}
          <div class="tweet-ref-metadata-title">
            {lastMetadataLink.metadata?.title}
          </div>
          <div class="tweet-ref-metadata-description">
            {lastMetadataLink.metadata?.description}
          </div>
          <div class="tweet-ref-metadata-domain">
            <LinkSvg />
            <span>{lastMetadataLink.longUrl.hostname}</span>
          </div>
        </a>
      ) : null}
    </>
  );
};

export const ExpandedQuote = component$<{
  tweet: TweetJsonResponse;
  expandQuotedTweet: boolean;
}>((props) => {
  const tweetRsrc = useResource$<TweetResponse[]>(async () => {
    if (!props.expandQuotedTweet) return [];
    return (
      await Promise.all(
        (props.tweet.data.referenced_tweets ?? []).map(
          async (referencedTweet) => {
            if (referencedTweet.type !== "quoted") return null;
            const quotedTweet = await getTweetImpl(referencedTweet.id).catch(
              () => {}
            );
            if (!quotedTweet || !("data" in quotedTweet)) return null;
            return quotedTweet;
          }
        )
      )
    ).filter((v) => v) as TweetResponse[];
  });
  return (
    <>
      {props.expandQuotedTweet ? (
        <Resource
          value={tweetRsrc}
          onResolved={(tweets: TweetResponse[]) => (
            <div class="tweet-quoted">
              {tweets.map((tweet) => (
                <Tweet
                  tweet={tweet as TweetJsonResponse}
                  expandQuotedTweet={false}
                />
              ))}
            </div>
          )}
        />
      ) : null}
    </>
  );
});

export const CreatedAt = (props: {
  tweet: TweetJsonResponse;
  tweetURL: string;
}) => {
  return (
    <div class="tweet-time">
      <a href={props.tweetURL} target="_blank" rel="noreferrer noopener">
        {formatDate(props.tweet.data.created_at)}
      </a>
    </div>
  );
};

export const Stats = (props: {
  tweet: TweetJsonResponse;
  tweetURL: string;
}) => {
  const likeIntent = `https://twitter.com/intent/like?tweet_id=${props.tweet.data.id}`;
  const retweetIntent = `https://twitter.com/intent/retweet?tweet_id=${props.tweet.data.id}`;

  const { like_count, reply_count, retweet_count, quote_count } =
    props.tweet.data.public_metrics;
  const likeCount = formatNumber(like_count);
  const replyCount = formatNumber(reply_count);
  const totalRetweets = formatNumber(retweet_count + quote_count);

  return (
    <div class="tweet-stats">
      <a
        href={props.tweetURL}
        class="tweet-reply"
        target="_blank"
        rel="noreferrer noopener"
      >
        <RepliesSVG />
        <span>{replyCount}</span>
      </a>
      <a
        href={retweetIntent}
        class="tweet-retweet"
        target="_blank"
        rel="noreferrer noopener"
      >
        <RetweetSVG />
        <span>{totalRetweets}</span>
      </a>
      <a
        href={likeIntent}
        class="tweet-like"
        target="_blank"
        rel="noreferrer noopener"
      >
        <LikesSVG />
        <span>{likeCount}</span>
      </a>
      <a
        href={props.tweetURL}
        class="tnk"
        target="_blank"
        rel="noreferrer noopener"
      >
        <ArrowSvg />
        <span></span>
      </a>
    </div>
  );
};

export const formatNumber = (num: number) =>
  new Intl.NumberFormat().format(num);

export function formatDate(dateString: string) {
  const data = new Date(dateString);
  // 12:55 AM · Dec 24, 2022
  return [
    data.getHours() % 12 || 12,
    ":",
    data.getMinutes(),
    " ",
    data.getHours() >= 12 ? "PM" : "AM",
    " · ",
    MONTH[data.getMonth()],
    " ",
    data.getDate(),
    ", ",
    data.getFullYear(),
  ].join("");
}

export const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function typedBoolean<T>(
  value: T
): value is Exclude<T, "" | 0 | false | null | undefined> {
  return Boolean(value);
}
const ELEMENT_REGEXP =
  /<meta(\s+(\w+(=("[^"]*"|'[^']*')|[\w\-.]*)?)+)*\s*\/?>/gm;
const ATTRIBUTE_REGEXP = /(\w+)=("[^"]*"|'[^']*'|[\w\-.]*|)/gm;
export async function getMetadata(url: string): Promise<Metadata> {
  const html = await fetch(url).then((res) => res.text());
  const meta: Record<string, string> = {};
  html.replaceAll(ELEMENT_REGEXP, (match) => {
    let property: string;
    let content: string;
    match.replaceAll(ATTRIBUTE_REGEXP, (_, key: string, value: string) => {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1);
      }
      if (key == "property") {
        property = value;
      }
      if (key == "content") {
        content = value;
      }
      if (
        property !== undefined &&
        content !== undefined &&
        property.startsWith("og:")
      ) {
        meta[property.substring(3)] = content;
      }
      if (property == undefined && content && content.startsWith("0;URL=")) {
        meta["redirect"] = content.substring(content.indexOf("=") + 1);
      }
      return "";
    });
    return "";
  });
  return meta;
}

export const PlaySvg = () => (
  <svg
    width="75"
    height="75"
    viewBox="0 0 75 75"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="37.4883" cy="37.8254" r="37" fill="white" />
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M35.2643 33.025L41.0017 36.9265C41.6519 37.369 41.6499 38.3118 40.9991 38.7518L35.2616 42.6276C34.5113 43.1349 33.4883 42.6077 33.4883 41.7143V33.9364C33.4883 33.0411 34.5146 32.5151 35.2643 33.025"
    />
  </svg>
);
export const LikesSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <g>
      <path d="M12 21.638h-.014C9.403 21.59 1.95 14.856 1.95 8.478c0-3.064 2.525-5.754 5.403-5.754 2.29 0 3.83 1.58 4.646 2.73.814-1.148 2.354-2.73 4.645-2.73 2.88 0 5.404 2.69 5.404 5.755 0 6.376-7.454 13.11-10.037 13.157H12zM7.354 4.225c-2.08 0-3.903 1.988-3.903 4.255 0 5.74 7.034 11.596 8.55 11.658 1.518-.062 8.55-5.917 8.55-11.658 0-2.267-1.823-4.255-3.903-4.255-2.528 0-3.94 2.936-3.952 2.965-.23.562-1.156.562-1.387 0-.014-.03-1.425-2.965-3.954-2.965z"></path>
    </g>
  </svg>
);
export const RepliesSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <g>
      <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c0-.414-.335-.75-.75-.75h-.396c-3.66 0-6.318-2.476-6.318-5.886 0-3.534 2.768-6.302 6.3-6.302l4.147.01h.002c3.532 0 6.3 2.766 6.302 6.296-.003 1.91-.942 3.844-2.514 5.176z"></path>
    </g>
  </svg>
);
export const RetweetSVG = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <g>
      <path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.337-.75-.75-.75z"></path>
    </g>
  </svg>
);
export const LinkSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <g>
      <path d="M11.96 14.945c-.067 0-.136-.01-.203-.027-1.13-.318-2.097-.986-2.795-1.932-.832-1.125-1.176-2.508-.968-3.893s.942-2.605 2.068-3.438l3.53-2.608c2.322-1.716 5.61-1.224 7.33 1.1.83 1.127 1.175 2.51.967 3.895s-.943 2.605-2.07 3.438l-1.48 1.094c-.333.246-.804.175-1.05-.158-.246-.334-.176-.804.158-1.05l1.48-1.095c.803-.592 1.327-1.463 1.476-2.45.148-.988-.098-1.975-.69-2.778-1.225-1.656-3.572-2.01-5.23-.784l-3.53 2.608c-.802.593-1.326 1.464-1.475 2.45-.15.99.097 1.975.69 2.778.498.675 1.187 1.15 1.992 1.377.4.114.633.528.52.928-.092.33-.394.547-.722.547z"></path>
      <path d="M7.27 22.054c-1.61 0-3.197-.735-4.225-2.125-.832-1.127-1.176-2.51-.968-3.894s.943-2.605 2.07-3.438l1.478-1.094c.334-.245.805-.175 1.05.158s.177.804-.157 1.05l-1.48 1.095c-.803.593-1.326 1.464-1.475 2.45-.148.99.097 1.975.69 2.778 1.225 1.657 3.57 2.01 5.23.785l3.528-2.608c1.658-1.225 2.01-3.57.785-5.23-.498-.674-1.187-1.15-1.992-1.376-.4-.113-.633-.527-.52-.927.112-.4.528-.63.926-.522 1.13.318 2.096.986 2.794 1.932 1.717 2.324 1.224 5.612-1.1 7.33l-3.53 2.608c-.933.693-2.023 1.026-3.105 1.026z"></path>
    </g>
  </svg>
);
export const ArrowSvg = () => (
  <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M17.25 15.25V6.75H8.75"
    ></path>
    <path
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.5"
      d="M17 7L6.75 17.25"
    ></path>
  </svg>
);

export function isTweetError(
  tweet: TweetResponse
): tweet is TweetErrorJsonResponse {
  return (tweet as TweetErrorJsonResponse).errors !== undefined;
}
