/**
 * Teen mode rules for WingsCrew Looks.
 *
 * True phone-contact matching comes with the native app. This web prototype
 * uses personal invite links only. There is no user search, no public profile,
 * and no directory of accounts. A hosted backend would deliver an accept to
 * the teen's account; here the invite, the accept, and the approval are stored
 * on this device.
 */
import { uid } from "./util.js";

export function emptyCircle() {
  return { friends: [], invites: [], parentToken: "", reports: [], shares: [] };
}

export function ageOn(iso, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) return null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (born > current) return -1;
  let age = current.getFullYear() - year;
  const beforeBirthday = current.getMonth() + 1 < month || (current.getMonth() + 1 === month && current.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/** "blocked" is under 13. Nothing about that person should be stored. */
export function ageBand(age) {
  if (age == null || age < 0 || age > 120) return "invalid";
  if (age < 13) return "blocked";
  if (age < 18) return "teen";
  return "adult";
}

export function modeOf(profile) {
  if (!profile?.onboarded) return "none";
  if (profile.ageBand === "teen") return "teen";
  return "adult";
}

export function isTeen(profile) {
  return modeOf(profile) === "teen";
}

/**
 * Returns a profile only for ages 13 and up.
 * Under 13 and invalid dates return null so the caller cannot save an account.
 */
export function profileFromBirthdate({ birthdate, displayName = "", today = new Date(), now = Date.now() }) {
  const band = ageBand(ageOn(birthdate, today));
  if (band !== "teen" && band !== "adult") return null;
  const name = String(displayName || "").trim().slice(0, 40);
  if (band === "teen" && !name) return null;
  return {
    onboarded: true,
    ageConfirmedAt: now,
    photoNoticeAt: now,
    birthdate,
    ageBand: band,
    displayName: band === "teen" ? name : "",
    videoExport: false,
  };
}

export function visiblePacks(packs, profile) {
  const list = packs || [];
  if (!isTeen(profile)) return list;
  return list.filter((pack) => pack.audience !== "18+" && !(pack.sponsored && pack.sponsorCategory === "adult"));
}

export function createInvite(circle, now = Date.now()) {
  const next = circle || emptyCircle();
  const invite = { token: uid("inv"), createdAt: now };
  return { circle: { ...next, invites: [...(next.invites || []), invite] }, invite };
}

export function acceptInvite(circle, { token, friendName }, now = Date.now()) {
  const next = circle || emptyCircle();
  const name = String(friendName || "").trim().slice(0, 40);
  if (!name) return { circle: next, error: "Enter your name so they know who to approve." };
  const invite = (next.invites || []).find((item) => item.token === token);
  if (!invite) return { circle: next, error: "This invite link isn't valid." };
  if ((next.friends || []).some((friend) => friend.inviteToken === token && friend.status !== "removed")) {
    return { circle: next, error: "This invite was already accepted." };
  }
  const friend = {
    id: uid("friend"),
    name,
    status: "pending",
    inviteToken: token,
    acceptedAt: now,
  };
  return { circle: { ...next, friends: [...(next.friends || []), friend] }, friend };
}

export function approveFriend(circle, { id }, now = Date.now()) {
  const next = circle || emptyCircle();
  let found = false;
  const friends = (next.friends || []).map((friend) => {
    if (friend.id !== id || friend.status !== "pending" || !friend.name) return friend;
    found = true;
    return { ...friend, status: "approved", approvedAt: now };
  });
  if (!found) return { circle: next, error: "Approve a friend by the name they gave you." };
  return { circle: { ...next, friends }, friend: friends.find((friend) => friend.id === id) };
}

export function removeFriend(circle, { id }) {
  const next = circle || emptyCircle();
  return {
    circle: {
      ...next,
      friends: (next.friends || []).map((friend) => (friend.id === id ? { ...friend, status: "removed" } : friend)),
    },
  };
}

export function blockFriend(circle, { id }, now = Date.now()) {
  const next = circle || emptyCircle();
  return {
    circle: {
      ...next,
      friends: (next.friends || []).map((friend) => (friend.id === id && friend.status !== "removed" ? { ...friend, status: "blocked", blockedAt: now } : friend)),
    },
  };
}

export function reportFriend(circle, { id }, now = Date.now()) {
  const next = circle || emptyCircle();
  const friend = (next.friends || []).find((item) => item.id === id);
  if (!friend) return { circle: next, error: "That friend isn't on this list." };
  const report = { id: uid("report"), friendId: friend.id, friendName: friend.name, createdAt: now };
  return { circle: { ...next, reports: [...(next.reports || []), report] }, report };
}

export function createParentLink(circle) {
  const next = circle || emptyCircle();
  if (next.parentToken) return { circle: next, token: next.parentToken };
  const token = uid("parent");
  return { circle: { ...next, parentToken: token }, token };
}

/** A parent sees names and status only. Looks, photos, and votes are omitted. */
export function parentSnapshot(circle, token) {
  const next = circle || emptyCircle();
  if (!token || token !== next.parentToken) return null;
  const friends = (next.friends || [])
    .filter((friend) => friend.status === "pending" || friend.status === "approved" || friend.status === "blocked")
    .map((friend) => ({ name: friend.name, status: friend.status }));
  return { friends };
}

export function isApproved(circle, friendId) {
  return (circle?.friends || []).some((friend) => friend.id === friendId && friend.status === "approved");
}

export function allowVote(profile, circle, vote) {
  if (!isTeen(profile)) return true;
  if (!vote) return false;
  if (vote.source === "device" || vote.voter === "you") return true;
  return isApproved(circle, vote.friendId);
}

export function allowMessage(profile, circle, senderId) {
  if (!isTeen(profile)) return true;
  return isApproved(circle, senderId);
}

export function allowLookShare(profile, circle, friendId) {
  if (!isTeen(profile)) return true;
  return isApproved(circle, friendId);
}

export function shareLookWith(circle, { lookId, friendId, video = false }, now = Date.now()) {
  const next = circle || emptyCircle();
  if (!isApproved(next, friendId)) return { circle: next, error: "Only an approved friend can receive a look." };
  const share = { token: uid("share"), lookId, friendId, video: Boolean(video), createdAt: now };
  return { circle: { ...next, shares: [...(next.shares || []), share] }, share };
}

export function canViewShare(circle, token) {
  const share = (circle?.shares || []).find((item) => item.token === token);
  if (!share || !isApproved(circle, share.friendId)) return null;
  return { lookId: share.lookId, friendId: share.friendId };
}
