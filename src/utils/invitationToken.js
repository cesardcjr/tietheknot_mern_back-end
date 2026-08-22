const jwt = require("jsonwebtoken");

const invitationSecret = () => process.env.INVITATION_TOKEN_SECRET || process.env.JWT_SECRET;

function createInvitationToken(invitation) {
  return jwt.sign(
    {
      invitationId: String(invitation._id),
      version: invitation.tokenVersion,
      scope: "invitation",
    },
    invitationSecret(),
  );
}

function verifyInvitationToken(token) {
  const payload = jwt.verify(token, invitationSecret());
  if (payload.scope !== "invitation" || !payload.invitationId) {
    throw new Error("Invalid invitation token");
  }
  return payload;
}

module.exports = { createInvitationToken, verifyInvitationToken };
