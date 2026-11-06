function toPoints(value) {
  const values = Array.isArray(value) ? value : [value]
  return values.flatMap((item) => String(item || '').split(/[；;。\n]+/))
    .map((item) => item.trim().replace(/^[•·\-\s]+/, ''))
    .filter(Boolean)
}

function getProfilePoints(profile = {}) {
  return {
    interestPoints: toPoints(profile.interests),
    stylePoints: toPoints(profile.stylePoints && profile.stylePoints.length ? profile.stylePoints : profile.style),
    boundaryPoints: toPoints(profile.boundaryPoints && profile.boundaryPoints.length ? profile.boundaryPoints : profile.boundaries),
    riskPoints: toPoints(profile.risks),
  }
}

module.exports = { toPoints, getProfilePoints }
