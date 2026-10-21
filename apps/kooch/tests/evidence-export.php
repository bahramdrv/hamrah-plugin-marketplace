<?php
// Run with PHP in the existing local WordPress container, never Production.
require '/var/www/html/wp-load.php';
require '/tmp/kooch-evidence-export.php';
// Use the public canonical origin for this isolated PHP request, without changing local site options.
add_filter('pre_option_home',fn()=> 'https://kooch.app');
add_filter('pre_option_siteurl',fn()=> 'https://kooch.app');
delete_transient('kooch_evidence_manifest_v1');
$manifest=rest_do_request(new WP_REST_Request('GET','/kooch/v2/evidence-manifest'));
if($manifest->is_error())throw new RuntimeException('Manifest failed: '.wp_json_encode($manifest->get_data()));
$envelope=$manifest->get_data();$m=json_decode($envelope['payload'],true);
if(hash('sha256',$envelope['payload'])!==$envelope['snapshot_id'] || $m['contract_version']!==1)throw new RuntimeException('Manifest integrity');
$routes=[];$pages=[];
foreach($m['pages'] as $p) {
 $path='/kooch/v2/evidence-page/'.$envelope['snapshot_id'].'/'.$p['index'];
 $response=rest_do_request(new WP_REST_Request('GET',$path));
 if($response->is_error())throw new RuntimeException('Page failed');$page=$response->get_data();
 if($page['snapshot_id']!==$envelope['snapshot_id'] || hash('sha256',$page['payload'])!==$p['sha256'])throw new RuntimeException('Page identity/hash');
 $parsed=json_decode($page['payload'],true);$routes=array_merge($routes,$parsed['routes']);$pages[]=$page;
}
if(count($routes)!==$m['total'])throw new RuntimeException('Partial activation');
foreach($routes as $r) {
 if($r['application']['evidence_checked_on']!==(kooch_visa_application_data()['routes'][$r['id']]['evidence_checked_on']))throw new RuntimeException('Review date extended');
 if(isset($r['primarySource'])||isset($r['owner'])||isset($r['email']))throw new RuntimeException('Unprojected payload');
}
$expired=rest_do_request(new WP_REST_Request('GET','/kooch/v2/evidence-page/'.str_repeat('0',64).'/0'));
if($expired->get_status()!==410)throw new RuntimeException('Expired cursor must fail');
file_put_contents('/tmp/kooch-evidence-export-fixture.json',wp_json_encode(['manifest'=>$envelope,'pages'=>$pages]));
echo 'PASS: immutable public manifest, '.count($pages).' pages, '.count($routes).' routes, hashes, original review dates, expired cursor'.PHP_EOL;
