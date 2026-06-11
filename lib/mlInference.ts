import * as ort from 'onnxruntime-node'
import path from 'path'
import fs from 'fs'

type Meta = {
  features: string[]
  threshold: number
  category_maps: Record<string, Record<string, number>>
}

type InferenceInput = {
  loan_amnt: number
  term: number
  int_rate: number
  annual_inc: number
  emp_length: number
  open_acc: number
  total_acc: number
  delinq_2yrs: number
  revol_util: number
  fico_score: number
  home_ownership: string
  dti: number
  inq_last_6mths: number
  pub_rec: number
  purpose: string
}

type InferenceResult = {
  decision: string
  default_prob: number
  score: number
  threshold: number
}

let _session: ort.InferenceSession | null = null
let _meta: Meta | null = null

function getMeta(): Meta {
  if (!_meta) {
    const metaPath = path.join(process.cwd(), 'loan_model_meta.json')
    _meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Meta
  }
  return _meta
}

async function getSession(): Promise<ort.InferenceSession> {
  if (!_session) {
    const modelPath = path.join(process.cwd(), 'loan_model.onnx')
    _session = await ort.InferenceSession.create(modelPath)
  }
  return _session
}

export async function runLoanInference(input: InferenceInput): Promise<InferenceResult> {
  const meta = getMeta()
  const session = await getSession()

  const catMaps = meta.category_maps
  const int_rate = input.int_rate <= 1 ? input.int_rate * 100 : input.int_rate

  const rawValues: Record<string, number> = {
    loan_amnt:      input.loan_amnt,
    term:           input.term,
    int_rate,
    annual_inc:     input.annual_inc,
    dti:            input.dti,
    fico_avg:       input.fico_score,
    emp_length:     input.emp_length,
    home_ownership: catMaps.home_ownership?.[input.home_ownership.toUpperCase()] ?? -1,
    purpose:        catMaps.purpose?.[input.purpose.toLowerCase().replace(/ /g, '_')] ?? -1,
    delinq_2yrs:    input.delinq_2yrs,
    inq_last_6mths: input.inq_last_6mths,
    open_acc:       input.open_acc,
    pub_rec:        input.pub_rec,
    revol_util:     input.revol_util,
    total_acc:      input.total_acc,
  }

  const featureVector = new Float32Array(
    meta.features.map((f) => rawValues[f] ?? 0)
  )

  const tensor = new ort.Tensor('float32', featureVector, [1, meta.features.length])
  const results = await session.run({ features: tensor })
  const prob = (results.probability.data as Float32Array)[0]

  const score = Math.round(1000 - prob * 1000)
  const decision = prob >= meta.threshold ? '거절' : '승인'

  return {
    decision,
    default_prob: Math.round(prob * 10000) / 10000,
    score,
    threshold: Math.round(meta.threshold * 10000) / 10000,
  }
}
