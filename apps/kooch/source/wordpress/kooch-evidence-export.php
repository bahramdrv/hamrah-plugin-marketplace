<?php
/** Plugin Name: Kooch Public Evidence Export
 * Version: 1.0.0
 * Requires the existing kooch-visa-data plugin. Public evidence only.
 */
defined('ABSPATH') || exit;
function kooch_evidence_encode($value) { return wp_json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
function kooch_evidence_source($value) {
 $keys=['id','url','title','authority','checked_on','retrieval_method'];
 return array_intersect_key($value,array_flip($keys));
}
function kooch_evidence_capture() {
 $cached=get_transient('kooch_evidence_manifest_v1');
 if(is_array($cached) && get_transient('kooch_evidence_v1_'.$cached['snapshot_id'])) return $cached;
 if(!function_exists('kooch_visa_application_data') || !function_exists('kooch_visa_enrichments')) return new WP_Error('evidence_unavailable','Public evidence exporter is not configured.',['status'=>503]);
 global $wpdb; $routes=[]; $coverage=null;
 $wpdb->query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
 try {
  // These reads share one database snapshot. Pagination exposed to consumers uses only the frozen copy below.
  for($offset=0;$offset<500;$offset+=100) {
   $request=new WP_REST_Request('GET','/kooch/v1/visa-catalog');
   $request->set_param('scope','iran-start');$request->set_param('limit',100);$request->set_param('offset',$offset);
   $response=rest_do_request($request);if($response->is_error())throw new RuntimeException('catalog');
   $data=$response->get_data();
   if(($data['sync']['last_attempt_status']??'')!=='ok' || !isset($data['total']) || $data['total']>500)throw new RuntimeException('catalog');
   $coverage=$data['application_coverage'];
   foreach($data['routes'] as $raw) {
    $id=$raw['destination'].':'.$raw['slug'];$guide=kooch_visa_guide($id);$facts=[];
    foreach(array_slice($guide['card_facts']??[],0,5) as $fact) {
     $fact_sources=[];foreach($fact['source_ids'] as $source_id) {
      $source=kooch_visa_enrichments()['sources'][$source_id]??null;
      if(!$source)throw new RuntimeException('source');$fact_sources[]=kooch_evidence_source($source);
     }
     $facts[]=['label'=>$fact['label'],'value'=>$fact['value'],'sources'=>$fact_sources];
    }
    $application=array_intersect_key($raw['application_from_iran'],array_flip(['route_key','iran_passport_status','start_from_iran','application_acceptance','legal_status','evidence_checked_on','valid_until','source_ids','reason_fa','in_person_followup_fa','additional_notes','conditions_fa','unknowns','application_fee']));
    // Never expose the original catalog payload or user/account tables.
    $route=['id'=>$id,'destination'=>$raw['destination'],'slug'=>$raw['slug'],'name_fa'=>$raw['name_fa'],'name'=>$raw['name'],'category'=>$raw['category'],'page_url'=>$raw['page_url'],'application'=>$application,'facts'=>$facts];
    if(is_string($raw['summary_fa']??null))$route['summary_fa']=$raw['summary_fa'];
    $routes[]=$route;
   }
   if(count($routes)===$data['total'])break;
   if(count($data['routes'])!==100)throw new RuntimeException('partial');
  }
  if(count($routes)!==$data['total'] || $coverage['documented_start']!==count($routes))throw new RuntimeException('partial');
  $wpdb->query('COMMIT');
 } catch(Throwable $error) {$wpdb->query('ROLLBACK');return new WP_Error('evidence_capture_failed','A complete public snapshot is unavailable.',['status'=>503]);}
 $sources=[];foreach(kooch_visa_application_data()['sources'] as $id=>$source)$sources[$id]=kooch_evidence_source($source);
 // HTTP retrieval time never changes checked_on, valid_until, or effective dates.
 $pages=[];$descriptors=[];
 foreach(array_chunk($routes,20) as $index=>$rows) {
  $payload=kooch_evidence_encode(['index'=>$index,'routes'=>$rows]);
  if(strlen($payload)>1500000)return new WP_Error('evidence_too_large','Public snapshot exceeds its bound.',['status'=>503]);
  $pages[]=$payload;$descriptors[]=['index'=>$index,'sha256'=>hash('sha256',$payload),'count'=>count($rows)];
 }
 $hour=(int)(floor(time()/3600)*3600);
 $payload=kooch_evidence_encode(['contract_version'=>1,'mapping_version'=>'iran-start-route-key-1','scope'=>'iran-start',
  'generated_at'=>gmdate('Y-m-d\TH:i:s\Z',$hour),'expires_at'=>gmdate('Y-m-d\TH:i:s\Z',$hour+172800),'freshness_policy'=>'iran-channel-14-days-1',
  'total'=>count($routes),'coverage'=>$coverage,'sources'=>(object)$sources,'pages'=>$descriptors]);
 $id=hash('sha256',$payload);$envelope=['snapshot_id'=>$id,'payload'=>$payload];
 if(strlen(kooch_evidence_encode([$envelope,$pages]))>8000000)return new WP_Error('evidence_too_large','Public snapshot exceeds its bound.',['status'=>503]);
 // Keys are content-derived and never overwritten. An expired old cursor receives 410, never pages from a new capture.
 if(!get_transient('kooch_evidence_v1_'.$id))set_transient('kooch_evidence_v1_'.$id,['manifest'=>$envelope,'pages'=>$pages],172800);
 set_transient('kooch_evidence_manifest_v1',$envelope,3600);
 return $envelope;
}
add_action('rest_api_init',function(){
 register_rest_route('kooch/v2','/evidence-manifest',['methods'=>'GET','permission_callback'=>'__return_true','callback'=>function($r){
  if($r->get_query_params())return new WP_Error('invalid_query','No query parameters are accepted.',['status'=>400]);
  return kooch_evidence_capture();
 }]);
 register_rest_route('kooch/v2','/evidence-page/(?P<snapshot>[a-f0-9]{64})/(?P<index>[0-9]{1,2})',['methods'=>'GET','permission_callback'=>'__return_true','callback'=>function($r){
  if($r->get_query_params())return new WP_Error('invalid_query','No query parameters are accepted.',['status'=>400]);
  $bundle=get_transient('kooch_evidence_v1_'.$r['snapshot']);$index=(int)$r['index'];
  if(!$bundle)return new WP_Error('snapshot_expired','Restart from a fresh manifest.',['status'=>410]);
  if(!isset($bundle['pages'][$index]))return new WP_Error('page_not_found','Page does not exist.',['status'=>404]);
  return ['snapshot_id'=>$r['snapshot'],'index'=>$index,'payload'=>$bundle['pages'][$index]];
 }]);
});
