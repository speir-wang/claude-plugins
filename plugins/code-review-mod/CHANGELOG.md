# Changelog

## 1.0.0 (2026-10-03)


### Features

* **code-review-mod:** add a review panel for the code-review skill ([db07fbe](https://github.com/speir-wang/claude-plugins/commit/db07fbedc4a3296908d3ae5fb9978bb8a036c276))
* **code-review-mod:** ask before a review of another PR replaces the one shown ([33d2b41](https://github.com/speir-wang/claude-plugins/commit/33d2b413ee982b6412f6618fc63690dcefd4dc21))
* **code-review-mod:** bring the review back on resume and start empty after /clear ([85ef319](https://github.com/speir-wang/claude-plugins/commit/85ef31956c113ebc7b9723212bdb18c22c01e6f3))
* **code-review-mod:** bring the review tab to the front when a review or re-check ends ([3b01f3d](https://github.com/speir-wang/claude-plugins/commit/3b01f3d4d40deaadf2af06fdbc466ce58269c9a7))
* **code-review-mod:** build a pending review and post it as one GitHub review ([4d23b74](https://github.com/speir-wang/claude-plugins/commit/4d23b748bdc071f0f354b1a3a859a79260442a05))
* **code-review-mod:** fix, skip or ask about a finding on your own PR ([58cdf12](https://github.com/speir-wang/claude-plugins/commit/58cdf129148c3c1062285f4fbef2b7c710d9d2e1))
* **code-review-mod:** open a finding to see the code now, the suggested code and why it matters ([b2eb5ba](https://github.com/speir-wang/claude-plugins/commit/b2eb5ba085c61b1eca683140c0389d302d475fdf))
* **code-review-mod:** pick the mode from the PR link and flip it in the panel ([5929743](https://github.com/speir-wang/claude-plugins/commit/5929743a40e6d42b430d1fe56a634d33cb57c137))
* **code-review-mod:** re-check fixed findings and list new problems by round ([d3c8152](https://github.com/speir-wang/claude-plugins/commit/d3c81528de7b00a9644af32b341b3f8f3359d08a))
* **code-review-mod:** re-check their PR from your own GitHub comments, in any session ([d8f2e05](https://github.com/speir-wang/claude-plugins/commit/d8f2e0567ae98129c777b30d590740130d235b81))
* **code-review-mod:** record findings with the review tool when the code-review skill runs ([b8639d8](https://github.com/speir-wang/claude-plugins/commit/b8639d84494dd23042262593c9d44fc8350caff2))
* **code-review-mod:** show findings in Standards and Spec groups, sorted by score ([43a0e87](https://github.com/speir-wang/claude-plugins/commit/43a0e87c8bc7501cba7e2b84bb921fbbdd9a832a))
* **code-review-mod:** show the letter keys in a finding ([d657c7b](https://github.com/speir-wang/claude-plugins/commit/d657c7b50fc275ec44667e5e339ac868aba3d469))
* **code-review-mod:** show the PR, counts and a tip that fits the mode ([6930b3e](https://github.com/speir-wang/claude-plugins/commit/6930b3e64189df38c2526c5316d341cccd16ccdb))
* **code-review-mod:** show, edit, rewrite or drop the comment draft on their PR ([025141b](https://github.com/speir-wang/claude-plugins/commit/025141b71ca08e1661c182bd97b7fdef7d44d889))
* **code-review-mod:** suggest Approve PR or Create PR once nothing is left, after asking ([de17b49](https://github.com/speir-wang/claude-plugins/commit/de17b4945712c0bceab0dbef811f761ad91a3040))


### Bug Fixes

* **code-review-mod:** hide the next step while a re-check finds a fix missing or wrong ([df172fb](https://github.com/speir-wang/claude-plugins/commit/df172fbb33991387ef99a8f98de7c2f857d252d7))
* **code-review-mod:** keep drafts not posted yet when re-checking their PR ([4486aa9](https://github.com/speir-wang/claude-plugins/commit/4486aa942fbb838122507e156643eac41e4f7ae1))
* **code-review-mod:** keep the review rule away from the built-in /code-review ([082ed50](https://github.com/speir-wang/claude-plugins/commit/082ed507c6c5d8da8434f008b43bb5b40709a00f))
* **code-review-mod:** number every row top to bottom so chat numbers match the panel ([f89edab](https://github.com/speir-wang/claude-plugins/commit/f89edab18f3421920a16b17d5deaa6e1ab2f5d6b))
* **code-review-mod:** offer Create PR only when the branch has no PR on GitHub ([743f8f7](https://github.com/speir-wang/claude-plugins/commit/743f8f7d46914a460d10a2b6ea1c124cf6a92d5c))
* **code-review-mod:** queue fixes on a fix list and fix them all in one commit ([452d18a](https://github.com/speir-wang/claude-plugins/commit/452d18ad888c22ac1708d6eea09488ba40cb06ee))
* **code-review-mod:** save a review waiting for Replace? so resume keeps it ([06556ee](https://github.com/speir-wang/claude-plugins/commit/06556eec810571defcb3010ec23b4d1172be375c))
* **code-review-mod:** show Reviewing until the review ends, and no next step before then ([d545eec](https://github.com/speir-wang/claude-plugins/commit/d545eec74c57f631e7c9681b7c9e456d65123641))
* **code-review-mod:** show scores as 9/10, must fix only for broken rules, and file names that fit ([0e0c95b](https://github.com/speir-wang/claude-plugins/commit/0e0c95bfc9ab3ffa5155c647b6a68ee4fd367408))


### Code Refactoring

* **code-review-mod:** one review-change helper, shared labels, one record path, and whole-mod draft tests ([711be5f](https://github.com/speir-wang/claude-plugins/commit/711be5fccb4eee2bbec6e3c871f762000ea97adb))
* **code-review-mod:** share outcome looks, name the tag type, and flag skipped groups ([956140a](https://github.com/speir-wang/claude-plugins/commit/956140a2757753313cd945a3346664a3d27fa7d5))
