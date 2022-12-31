import { component$ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div>
      <script type="module" async src="/tweet/1606438382561026049" />
      <script type="module" async src="/tweet/1605251245186244608" />
      <script type="module" async src="/tweet/1606674790156472320" />
      <script
        type="module"
        async
        src="https://qwik-twitter.pages.dev/tweet/1608389069469540355"
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Welcome to Qwik",
  meta: [
    {
      name: "description",
      content: "Qwik site description",
    },
  ],
};
