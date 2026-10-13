import assert from "node:assert/strict";
import test from "node:test";
import { PACKS } from "../js/catalog.js";
import {
  acceptInvite,
  ageBand,
  ageOn,
  allowMessage,
  allowVote,
  approveFriend,
  blockFriend,
  canViewShare,
  createInvite,
  createParentLink,
  emptyCircle,
  modeOf,
  parentSnapshot,
  profileFromBirthdate,
  removeFriend,
  reportFriend,
  shareLookWith,
  visiblePacks,
} from "../js/safety.js";

const today = new Date(2026, 9, 13);

test("birthday chooses blocked, teen, or adult", () => {
  assert.equal(ageBand(ageOn("2014-10-14", today)), "blocked");
  assert.equal(ageBand(ageOn("2013-10-13", today)), "teen");
  assert.equal(ageBand(ageOn("2013-10-14", today)), "blocked");
  assert.equal(ageBand(ageOn("2009-06-01", today)), "teen");
  assert.equal(ageBand(ageOn("2008-10-13", today)), "adult");
  assert.equal(ageBand(ageOn("2008-10-14", today)), "teen");
  assert.equal(ageBand(ageOn("2027-01-01", today)), "invalid");
  assert.equal(profileFromBirthdate({ birthdate: "2015-01-01", today }), null);
  const teen = profileFromBirthdate({ birthdate: "2012-03-20", displayName: "Sam", today });
  assert.equal(teen.ageBand, "teen");
  assert.equal(teen.videoExport, false);
  assert.equal(profileFromBirthdate({ birthdate: "2012-03-20", displayName: "  ", today }), null);
  const adult = profileFromBirthdate({ birthdate: "1994-04-02", today });
  assert.equal(adult.ageBand, "adult");
  assert.equal(modeOf({ onboarded: true, ageConfirmedAt: 1 }), "adult");
});

test("a friend must accept and the teen approves by name", () => {
  let circle = emptyCircle();
  const invited = createInvite(circle);
  circle = invited.circle;
  const missing = acceptInvite(circle, { token: invited.invite.token, friendName: "  " });
  assert.ok(missing.error);
  const accepted = acceptInvite(circle, { token: invited.invite.token, friendName: "Sam" });
  circle = accepted.circle;
  assert.equal(accepted.friend.status, "pending");
  const approved = approveFriend(circle, { id: accepted.friend.id });
  circle = approved.circle;
  assert.equal(approved.friend.status, "approved");
  assert.equal(approved.friend.name, "Sam");
});

test("strangers cannot vote, message, or open a look", () => {
  const teen = { onboarded: true, ageBand: "teen" };
  let circle = emptyCircle();
  const invited = createInvite(circle);
  const accepted = acceptInvite(invited.circle, { token: invited.invite.token, friendName: "Sam" });
  circle = accepted.circle;
  assert.equal(allowVote(teen, circle, { source: "friend", friendId: accepted.friend.id }), false);
  assert.equal(allowMessage(teen, circle, accepted.friend.id), false);
  const approved = approveFriend(circle, { id: accepted.friend.id });
  circle = approved.circle;
  assert.equal(allowVote(teen, circle, { source: "device", voter: "you" }), true);
  assert.equal(allowVote(teen, circle, { source: "friend", friendId: accepted.friend.id }), true);
  assert.equal(allowVote(teen, circle, { source: "friend", friendId: "stranger" }), false);
  const sent = shareLookWith(circle, { lookId: "look1", friendId: accepted.friend.id });
  assert.equal(canViewShare(sent.circle, sent.share.token).lookId, "look1");
  const blocked = blockFriend(sent.circle, { id: accepted.friend.id });
  assert.equal(canViewShare(blocked.circle, sent.share.token), null);
  assert.equal(allowVote(teen, blocked.circle, { source: "friend", friendId: accepted.friend.id }), false);
});

test("a parent snapshot is the friends list and nothing else", () => {
  let circle = emptyCircle();
  const invited = createInvite(circle);
  const accepted = acceptInvite(invited.circle, { token: invited.invite.token, friendName: "Sam" });
  circle = approveFriend(accepted.circle, { id: accepted.friend.id }).circle;
  circle.looks = [{ id: "secret" }];
  const linked = createParentLink(circle);
  const snapshot = parentSnapshot(linked.circle, linked.token);
  assert.deepEqual(Object.keys(snapshot), ["friends"]);
  assert.deepEqual(snapshot.friends, [{ name: "Sam", status: "approved" }]);
  assert.equal(parentSnapshot(linked.circle, "nope"), null);
  const reported = reportFriend(linked.circle, { id: accepted.friend.id });
  assert.equal(reported.report.friendName, "Sam");
  const removed = removeFriend(linked.circle, { id: accepted.friend.id });
  assert.equal(parentSnapshot(createParentLink(removed.circle).circle, linked.token).friends.length, 0);
});

test("teen mode hides adult and sponsored-adult packs", () => {
  const teen = { onboarded: true, ageBand: "teen" };
  const adult = { onboarded: true, ageBand: "adult" };
  assert.deepEqual(visiblePacks(PACKS, teen).map((pack) => pack.id), ["everyday", "wedding-guest"]);
  assert.ok(visiblePacks(PACKS, adult).some((pack) => pack.id === "after-hours"));
});
