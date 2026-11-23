import { objKeyMap } from '@genshin-optimizer/common/util'
import {
  type ArtifactSlotKey,
  allArtifactSlotKeys,
} from '@genshin-optimizer/gi/consts'
import type { ArtCharDatabase } from '../ArtCharDatabase'
import { DataManager } from '../DataManager'

export interface GeneratedBuild {
  weaponId?: string
  artifactIds: Record<ArtifactSlotKey, string | undefined>
}

export interface GeneratedBuildList {
  builds: GeneratedBuild[]
  weaponBuilds?: GeneratedBuild[]
  buildDate: number
}

export class GeneratedBuildListDataManager extends DataManager<
  string,
  'generatedBuildList',
  GeneratedBuildList,
  GeneratedBuildList,
  ArtCharDatabase
> {
  constructor(database: ArtCharDatabase) {
    super(database, 'generatedBuildList')
    for (const key of this.database.storage.keys)
      if (key.startsWith('generatedBuildList_') && !this.set(key, {}))
        this.database.storage.remove(key)
  }

  private validateBuilds(buildsRaw: unknown): GeneratedBuild[] {
    if (!Array.isArray(buildsRaw)) return []
    return buildsRaw
      .map((build) => {
        if (typeof build !== 'object' || build === null) return undefined
        const { artifactIds: artifactIdsRaw } = build as GeneratedBuild
        if (typeof artifactIdsRaw !== 'object' || artifactIdsRaw === null)
          return undefined
        let { weaponId } = build as GeneratedBuild
        if (weaponId && !this.database.weapons.get(weaponId))
          weaponId = undefined

        const artifactIds = objKeyMap(allArtifactSlotKeys, (slotKey) =>
          this.database.arts.get(artifactIdsRaw[slotKey])?.slotKey === slotKey
            ? artifactIdsRaw[slotKey]
            : undefined
        )

        return { artifactIds, weaponId }
      })
      .filter((build): build is GeneratedBuild => build !== undefined)
  }

  override validate(obj: unknown): GeneratedBuildList | undefined {
    if (typeof obj !== 'object' || obj === null) return undefined
    let { builds, weaponBuilds, buildDate } = obj as GeneratedBuildList

    if (!Array.isArray(builds)) {
      builds = []
      buildDate = 0
    } else {
      builds = this.validateBuilds(builds)
      if (!Number.isInteger(buildDate)) buildDate = 0
    }

    const validatedWeaponBuilds = Array.isArray(weaponBuilds)
      ? this.validateBuilds(weaponBuilds)
      : undefined

    return {
      buildDate,
      builds,
      ...(validatedWeaponBuilds?.length
        ? { weaponBuilds: validatedWeaponBuilds }
        : {}),
    }
  }

  new(data: GeneratedBuildList) {
    const id = this.generateKey()
    this.set(id, { ...data })
    return id
  }
}
