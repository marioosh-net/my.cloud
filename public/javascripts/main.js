var getBytesWithUnit = function( bytes ){
	if( isNaN( bytes ) ){ return; }
	var units = [ ' bytes', ' KB', ' MB', ' GB', ' TB', ' PB', ' EB', ' ZB', ' YB' ];
	var amountOf2s = Math.floor( Math.log( +bytes )/Math.log(2) );
	if( amountOf2s < 1 ){
		amountOf2s = 0;
	}
	var i = Math.floor( amountOf2s / 10 );
	bytes = +bytes / Math.pow( 2, 10*i );
 
	// Rounds to 3 decimals places.
        if( bytes.toString().length > bytes.toFixed(3).toString().length ){
            bytes = bytes.toFixed(3);
        }
	return bytes + units[i];
};

$(function(){
	var socket = io.connect();
	socket.on('connect', function () {
		$('#socketid').val(this.socket.sessionid);
	});	
	socket.on('progress', function (data) {
		$('#progress').show();
		$('#progress-el').css('width', data.p+'%');
		$('#progress-el').attr('aria-valuenow',data.p);
		$('#progress-el').text(getBytesWithUnit(data.count) + ' / ' + getBytesWithUnit(data.of));
		if(data.p == 100 || data.p == 0) {
			$('#progress').hide();
		}
	});

	$('#url-form').submit(function(){
		$('#save').trigger('click');
		return false;
	});
	$('#save').click(function(){
		$.ajax({
			url: '/',
			method: 'post',
			data: $("#url-form").serialize()
		})
		.done(function(data, status, request) {
			$('#list').load('/list');
			$('#url').val('');
		})
		.fail(function(jqXHR, status, errorThrow){
			alert('Problem z pobraniem ścieżki');
		});		
	});

	$('#search-clear').click(function(){
		$('#search').val('');
		$('#page').val('1');
		$('#list').load('/list');
		$('#search').focus();
		return false;
	})
	$('#search-btn').click(function(){
		$('#page').val('1');
		$('#list').load('/list/1?search='+encodeURIComponent($('#search').val()));		
		$('#search').focus();
		$('#search').select();
		return false;
	});
	$('#search').keypress(function (e) {
  		if (e.which == 13) {	
  			$('#search-btn').trigger('click');
  			return false;
  		}
  	});

	var loadPagePlus = function() {
    	var page = parseInt($('#page').val());
		$('#list').load('/list/'+ ++page+'?search='+encodeURIComponent($('#search').val()));		
	}
	$(window).scroll(function() {
	    if($(window).scrollTop() == $(document).height() - $(window).height()) {
	    	loadPagePlus();
	    }
	});
	$('#more').click(function(){
		loadPagePlus();
		return false;
	});

	/*
	if($(window).scrollTop() < $(document).height() - $(window).height()) {
		$('#more').hide();
	}
	*/
});